import pg from 'pg';
import { config } from '../config/index.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test database connection
export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (error) {
    console.error('Database connection error:', error);
    return false;
  }
}

// Initialize database (run migrations)
export async function initializeDatabase(): Promise<void> {
  console.log('🔄 Initializing database...');
  
  try {
    const client = await pool.connect();
    
    // Read and execute migration files
    // For simplicity, we'll run the schema directly here
    // In production, use a proper migration tool
    
    // Check if tables exist
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'signature_packages'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('📦 Creating database tables...');
      
      // Run the migration
      const fs = await import('fs');
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      
      const migrationPath = path.join(__dirname, 'migrations', '001_create_tables.sql');
      
      try {
        const migration = fs.readFileSync(migrationPath, 'utf-8');
        await client.query(migration);
        console.log('✅ Database tables created successfully');
      } catch (err) {
        console.warn('⚠️  Migration file not found or error running migration:', err);
        console.log('   Tables may need to be created manually');
      }
    } else {
      console.log('✅ Database tables already exist');
    }
    
    client.release();
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
}

// Close database connection
export async function closeDatabase(): Promise<void> {
  await pool.end();
  console.log('Database connection closed');
}
