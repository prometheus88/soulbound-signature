'use client';

import { useCallback, useRef, useState, useMemo, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

// Set worker source
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
}

export type FieldType = 'signature' | 'initial' | 'name' | 'email' | 'date' | 'text' | 'checkbox';

export interface PlacedField {
  id: string;
  type: FieldType;
  recipientIndex: number;
  page: number;
  x: number; // percentage of page width
  y: number; // percentage of page height
  width: number; // percentage
  height: number; // percentage
}

interface Recipient {
  name: string;
  email?: string;
  walletAddress?: string;
}

interface DocumentEditorProps {
  pdfData: string; // base64
  recipients: Recipient[];
  fields: PlacedField[];
  onFieldsChange: (fields: PlacedField[]) => void;
  readOnly?: boolean;
}

const FIELD_TYPES: { type: FieldType; label: string; icon: string; defaultSize: { w: number; h: number } }[] = [
  { type: 'signature', label: 'Signature', icon: '✍️', defaultSize: { w: 20, h: 8 } },
  { type: 'initial', label: 'Initials', icon: '🔤', defaultSize: { w: 10, h: 6 } },
  { type: 'name', label: 'Name', icon: '👤', defaultSize: { w: 18, h: 4 } },
  { type: 'email', label: 'Email', icon: '📧', defaultSize: { w: 22, h: 4 } },
  { type: 'date', label: 'Date', icon: '📅', defaultSize: { w: 15, h: 4 } },
  { type: 'text', label: 'Text', icon: '📝', defaultSize: { w: 20, h: 4 } },
  { type: 'checkbox', label: 'Checkbox', icon: '☑️', defaultSize: { w: 4, h: 4 } },
];

const RECIPIENT_COLORS = [
  'bg-blue-500/20 border-blue-500',
  'bg-green-500/20 border-green-500',
  'bg-purple-500/20 border-purple-500',
  'bg-orange-500/20 border-orange-500',
  'bg-pink-500/20 border-pink-500',
];

export function DocumentEditor({ 
  pdfData, 
  recipients, 
  fields, 
  onFieldsChange,
  readOnly = false,
}: DocumentEditorProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedFieldType, setSelectedFieldType] = useState<FieldType | null>(null);
  const [selectedRecipient, setSelectedRecipient] = useState(0);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [draggingField, setDraggingField] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  // Update canvas dimensions when page renders
  useEffect(() => {
    const updateCanvasDimensions = () => {
      if (pageRef.current) {
        const canvas = pageRef.current.querySelector('canvas');
        if (canvas) {
          setCanvasDimensions({
            width: canvas.offsetWidth,
            height: canvas.offsetHeight,
          });
        }
      }
    };

    // Use MutationObserver to detect when canvas is added/resized
    const observer = new MutationObserver(updateCanvasDimensions);
    if (pageRef.current) {
      observer.observe(pageRef.current, { childList: true, subtree: true });
    }

    // Also update on resize
    window.addEventListener('resize', updateCanvasDimensions);
    
    // Initial update
    const timeoutId = setTimeout(updateCanvasDimensions, 100);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateCanvasDimensions);
      clearTimeout(timeoutId);
    };
  }, [currentPage, scale, numPages]);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    console.log('PDF loaded successfully, pages:', numPages);
    setNumPages(numPages);
    setPdfError(null);
  }, []);

  const onDocumentLoadError = useCallback((error: Error) => {
    console.error('PDF load error:', error);
    setPdfError(error.message);
  }, []);

  // Memoize the PDF file object to prevent re-renders
  const pdfFile = useMemo(() => {
    try {
      const binaryString = atob(pdfData);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return { data: bytes };
    } catch (e) {
      console.error('Error converting PDF data:', e);
      return `data:application/pdf;base64,${pdfData}`;
    }
  }, [pdfData]);

  const getPageDimensions = useCallback(() => {
    if (!pageRef.current) return { width: 0, height: 0 };
    const canvas = pageRef.current.querySelector('canvas');
    if (!canvas) return { width: 0, height: 0 };
    return { width: canvas.offsetWidth, height: canvas.offsetHeight };
  }, []);

  const handlePageClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!selectedFieldType || readOnly) return;

    const pageElement = pageRef.current;
    if (!pageElement) return;

    const canvas = pageElement.querySelector('canvas');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const fieldDef = FIELD_TYPES.find(f => f.type === selectedFieldType);
    const defaultSize = fieldDef?.defaultSize || { w: 15, h: 5 };

    const newField: PlacedField = {
      id: `field-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: selectedFieldType,
      recipientIndex: selectedRecipient,
      page: currentPage,
      x: Math.max(0, Math.min(100 - defaultSize.w, x - defaultSize.w / 2)),
      y: Math.max(0, Math.min(100 - defaultSize.h, y - defaultSize.h / 2)),
      width: defaultSize.w,
      height: defaultSize.h,
    };

    onFieldsChange([...fields, newField]);
    setSelectedFieldType(null);
  }, [selectedFieldType, selectedRecipient, currentPage, fields, onFieldsChange, readOnly]);

  const handleFieldClick = (e: React.MouseEvent, fieldId: string) => {
    e.stopPropagation();
    if (!readOnly) {
      setSelectedFieldId(selectedFieldId === fieldId ? null : fieldId);
    }
  };

  const handleDeleteField = (fieldId: string) => {
    onFieldsChange(fields.filter(f => f.id !== fieldId));
    setSelectedFieldId(null);
  };

  // Drag handling for fields
  const handleFieldMouseDown = useCallback((e: React.MouseEvent, fieldId: string) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    
    const field = fields.find(f => f.id === fieldId);
    if (!field) return;
    
    const canvas = pageRef.current?.querySelector('canvas');
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * 100;
    const clickY = ((e.clientY - rect.top) / rect.height) * 100;
    
    setDraggingField(fieldId);
    setDragOffset({
      x: clickX - field.x,
      y: clickY - field.y,
    });
    setSelectedFieldId(fieldId);
  }, [fields, readOnly]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingField || readOnly) return;
    
    const canvas = pageRef.current?.querySelector('canvas');
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * 100;
    const mouseY = ((e.clientY - rect.top) / rect.height) * 100;
    
    const field = fields.find(f => f.id === draggingField);
    if (!field) return;
    
    const newX = Math.max(0, Math.min(100 - field.width, mouseX - dragOffset.x));
    const newY = Math.max(0, Math.min(100 - field.height, mouseY - dragOffset.y));
    
    onFieldsChange(fields.map(f => 
      f.id === draggingField 
        ? { ...f, x: newX, y: newY }
        : f
    ));
  }, [draggingField, dragOffset, fields, onFieldsChange, readOnly]);

  const handleMouseUp = useCallback(() => {
    setDraggingField(null);
  }, []);

  const currentPageFields = fields.filter(f => f.page === currentPage);

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full">
      {/* Toolbar */}
      {!readOnly && (
        <div className="lg:w-64 space-y-4">
          {/* Recipient Selector */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-medium mb-3">Assign to Signer</h3>
            <div className="space-y-2">
              {recipients.map((r, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedRecipient(i)}
                  className={cn(
                    'w-full flex items-center gap-2 p-2 rounded border text-left text-sm',
                    selectedRecipient === i 
                      ? RECIPIENT_COLORS[i % RECIPIENT_COLORS.length] 
                      : 'bg-gray-50 hover:bg-gray-100'
                  )}
                >
                  <div className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-medium',
                    ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500'][i % 5]
                  )}>
                    {i + 1}
                  </div>
                  <span className="truncate">{r.name || `Signer ${i + 1}`}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Field Type Selector */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-medium mb-3">Add Field</h3>
            <p className="text-xs text-gray-500 mb-3">
              Select a field type, then click on the document to place it.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {FIELD_TYPES.map(ft => (
                <button
                  key={ft.type}
                  onClick={() => setSelectedFieldType(selectedFieldType === ft.type ? null : ft.type)}
                  className={cn(
                    'flex flex-col items-center p-2 rounded border text-sm transition-colors',
                    selectedFieldType === ft.type 
                      ? 'bg-primary text-white border-primary' 
                      : 'bg-gray-50 hover:bg-gray-100'
                  )}
                >
                  <span className="text-lg">{ft.icon}</span>
                  <span className="text-xs">{ft.label}</span>
                </button>
              ))}
            </div>
            {selectedFieldType && (
              <p className="text-xs text-primary mt-3">
                Click on the document to place a {selectedFieldType} field
              </p>
            )}
          </div>

          {/* Field List */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-medium mb-3">Placed Fields ({fields.length})</h3>
            {fields.length === 0 ? (
              <p className="text-sm text-gray-500">No fields placed yet</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {fields.map((field) => (
                  <div 
                    key={field.id}
                    className={cn(
                      'flex items-center justify-between p-2 rounded text-sm',
                      RECIPIENT_COLORS[field.recipientIndex % RECIPIENT_COLORS.length]
                    )}
                  >
                    <span>
                      {FIELD_TYPES.find(f => f.type === field.type)?.icon} {field.type} (P{field.page})
                    </span>
                    <button
                      onClick={() => handleDeleteField(field.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* PDF Viewer */}
      <div className="flex-1 flex flex-col bg-gray-100 rounded-lg overflow-hidden">
        {/* Page Controls */}
        <div className="flex items-center justify-between p-3 bg-white border-b">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
            >
              ←
            </Button>
            <span className="text-sm">
              Page {currentPage} of {numPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCurrentPage(Math.min(numPages, currentPage + 1))}
              disabled={currentPage >= numPages}
            >
              →
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setScale(Math.max(0.5, scale - 0.1))}
            >
              −
            </Button>
            <span className="text-sm w-16 text-center">{Math.round(scale * 100)}%</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setScale(Math.min(2, scale + 0.1))}
            >
              +
            </Button>
          </div>
        </div>

        {/* Document Area */}
        <div 
          ref={containerRef}
          className="flex-1 overflow-auto p-6 flex justify-center"
        >
          <div 
            ref={pageRef}
            className="relative bg-white shadow-lg"
          >
            <Document
              file={pdfFile}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={
                <div className="w-[612px] h-[792px] flex items-center justify-center bg-gray-100">
                  <span className="text-gray-500">Loading PDF...</span>
                </div>
              }
              error={
                <div className="w-[612px] h-[792px] flex items-center justify-center bg-red-50 border border-red-200 rounded">
                  <div className="text-center p-4">
                    <p className="text-red-600 font-medium">Failed to load PDF</p>
                    {pdfError && <p className="text-red-500 text-sm mt-2">{pdfError}</p>}
                    <p className="text-gray-500 text-sm mt-2">Please try uploading the file again.</p>
                  </div>
                </div>
              }
            >
              <Page 
                pageNumber={currentPage} 
                scale={scale}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            </Document>

            {/* Placed Fields Overlay - positioned exactly over the canvas */}
            {canvasDimensions && (
              <div
                className={cn(
                  'absolute top-0 left-0',
                  selectedFieldType && !readOnly && 'cursor-crosshair',
                  draggingField && 'cursor-grabbing'
                )}
                style={{
                  width: canvasDimensions.width,
                  height: canvasDimensions.height,
                }}
                onClick={handlePageClick}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                {currentPageFields.map((field) => {
                  const colorIndex = field.recipientIndex % RECIPIENT_COLORS.length;
                  const isDragging = draggingField === field.id;
                  return (
                    <div
                      key={field.id}
                      className={cn(
                        'absolute border-2 rounded transition-all select-none',
                        RECIPIENT_COLORS[colorIndex],
                        selectedFieldId === field.id && 'ring-2 ring-offset-2 ring-primary',
                        !readOnly && 'cursor-grab',
                        isDragging && 'cursor-grabbing opacity-80 shadow-lg'
                      )}
                      style={{
                        left: `${field.x}%`,
                        top: `${field.y}%`,
                        width: `${field.width}%`,
                        height: `${field.height}%`,
                        zIndex: isDragging ? 1000 : selectedFieldId === field.id ? 100 : 10,
                      }}
                      onClick={(e) => handleFieldClick(e, field.id)}
                      onMouseDown={(e) => handleFieldMouseDown(e, field.id)}
                    >
                      <div className="absolute inset-0 flex items-center justify-center text-xs font-medium opacity-70 pointer-events-none">
                        {FIELD_TYPES.find(f => f.type === field.type)?.icon} {field.type}
                      </div>
                      {selectedFieldId === field.id && !readOnly && !isDragging && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteField(field.id);
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600 z-50"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
