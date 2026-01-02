// Secure Node.js server with persistent database and enhanced security
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure directories exist
const uploadsDir = path.join(__dirname, 'uploads', 'products');
const publicDir = path.join(__dirname, 'public');
const logsDir = path.join(__dirname, 'logs');

[uploadsDir, publicDir, logsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting for login attempts
const loginAttempts = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 20;

// Input sanitization
function sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    return input.replace(/[<>]/g, '');
}

// Logging system
function writeLog(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        level,
        message,
        data: data ? JSON.stringify(data) : null
    };
    
    const logFile = path.join(logsDir, `app-${new Date().toISOString().split('T')[0]}.log`);
    const logLine = `${timestamp} [${level}] ${message}${data ? ' - ' + JSON.stringify(data) : ''}\n`;
    
    try {
        fs.appendFileSync(logFile, logLine);
    } catch (error) {
        console.error('Failed to write log:', error.message);
    }
    
    // Also log to console for development
    console.log(`[${level}] ${message}`, data || '');
}

// Database with file persistence and write queue
const DB_FILE = path.join(__dirname, 'database.json');
let writeQueue = Promise.resolve();
let dbLock = false;

// Load database from file or create default
function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            const db = JSON.parse(data);
            
            // Clear default categories if they exist
            if (db.categories && db.categories.length > 0) {
                const defaultCategoryNames = ['camisetas', 'sudaderas', 'pantalones', 'accesorios'];
                const hasDefaultCategories = db.categories.some(cat => 
                    defaultCategoryNames.includes(cat.name.toLowerCase())
                );
                
                if (hasDefaultCategories) {
                    writeLog('INFO', 'Removing default categories', { 
                        oldCategories: db.categories.length,
                        categories: db.categories.map(c => c.name)
                    });
                    db.categories = [];
                    writeLog('INFO', 'Categories cleared for manual creation');
                }
            }
            
            writeLog('INFO', 'Database loaded successfully', { products: db.products?.length || 0, categories: db.categories?.length || 0 });
            return db;
        }
    } catch (error) {
        writeLog('ERROR', 'Error loading database, creating new one', { error: error.message });
    }
    
    // Default database structure
    return {
        users: [
            {
                id: 1,
                username: process.env.ADMIN_USERNAME || 'admin',
                passwordHash: process.env.ADMIN_PASSWORD_HASH || crypto.createHash('sha256').update('admin123').digest('hex'),
                role: 'admin'
            },
            {
                id: 2,
                username: 'Óscar',
                passwordHash: 'd66a93e05da92d10ddaf5c55b93f3769613713cc5e3d581c1c6befcbf7cdb16f',
                role: 'admin'
            },
            {
                id: 3,
                username: 'Gunnar',
                passwordHash: crypto.createHash('sha256').update('SESAMO123').digest('hex'),
                role: 'admin'
            }
        ],
        categories: [],
        products: [],
        orders: [],
        stats: {
            totalProducts: 0,
            totalOrders: 0,
            totalRevenue: 0.00,
            totalCustomers: 0
        },
        activityLog: []
    };
}

// Save database to file with concurrency control
function saveDatabase() {
    return new Promise((resolve, reject) => {
        writeQueue = writeQueue.then(async () => {
            if (dbLock) {
                // Wait for lock to be released
                await new Promise(wait => setTimeout(wait, 10));
                return saveDatabase();
            }
            
            dbLock = true;
            try {
                // Create backup before writing
                const backupFile = DB_FILE + '.backup';
                if (fs.existsSync(DB_FILE)) {
                    fs.copyFileSync(DB_FILE, backupFile);
                }
                
                // Write to temporary file first
                const tempFile = DB_FILE + '.tmp';
                fs.writeFileSync(tempFile, JSON.stringify(database, null, 2));
                
                // Atomic rename
                fs.renameSync(tempFile, DB_FILE);
                
                // Remove backup
                if (fs.existsSync(backupFile)) {
                    fs.unlinkSync(backupFile);
                }
                
                writeLog('DEBUG', 'Database saved successfully');
                resolve();
            } catch (error) {
                writeLog('ERROR', 'Failed to save database', { error: error.message });
                // Try to restore from backup
                const backupFile = DB_FILE + '.backup';
                if (fs.existsSync(backupFile)) {
                    try {
                        fs.copyFileSync(backupFile, DB_FILE);
                        writeLog('INFO', 'Database restored from backup');
                    } catch (restoreError) {
                        writeLog('ERROR', 'Failed to restore backup', { error: restoreError.message });
                    }
                }
                reject(error);
            } finally {
                dbLock = false;
            }
        });
        
        writeQueue.then(resolve).catch(reject);
    });
}

// Initialize database
let database = loadDatabase();

// Session management (prepared for Redis migration)
const sessions = new Map();

// Helper functions
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

function generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

function authenticateUser(username, password) {
    writeLog('INFO', 'Login attempt', { username });
    
    const sanitizedUsername = sanitizeInput(username);
    const passwordHash = hashPassword(password);
    const user = database.users.find(u => u.username === sanitizedUsername && u.passwordHash === passwordHash);

    if (user) {
        writeLog('INFO', 'Authentication successful', { username: sanitizedUsername });
        return user;
    }

    writeLog('WARNING', 'Authentication failed', { username: sanitizedUsername });
    return null;
}

function validateSession(token) {
    const session = sessions.get(token);
    if (!session) {
        return null;
    }
    
    if (session.expiresAt < Date.now()) {
        sessions.delete(token);
        writeLog('INFO', 'Session expired and removed', { token: token.substring(0, 8) + '...' });
        return null;
    }
    
    return session.user;
}

function getTokenFromHeader(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;

    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
        return parts[1];
    }

    return authHeader;
}

// Rate limiting middleware for login
function rateLimitLogin(req, res, next) {
    const clientIP = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    if (!loginAttempts.has(clientIP)) {
        loginAttempts.set(clientIP, { count: 0, resetTime: now + RATE_LIMIT_WINDOW });
    }
    
    const attempts = loginAttempts.get(clientIP);
    
    if (now > attempts.resetTime) {
        attempts.count = 0;
        attempts.resetTime = now + RATE_LIMIT_WINDOW;
    }
    
    attempts.count++;
    
    if (attempts.count > RATE_LIMIT_MAX) {
        writeLog('WARNING', 'Rate limit exceeded for login', { IP: clientIP, count: attempts.count });
        return res.status(429).json({ error: 'Demasiados intentos. Intenta más tarde.' });
    }
    
    next();
}

// Product validation
function validateProduct(data, isUpdate = false) {
    const errors = [];
    
    // Sanitize all string inputs
    if (data.name) data.name = sanitizeInput(data.name);
    if (data.description) data.description = sanitizeInput(data.description);
    if (data.category) data.category = sanitizeInput(data.category);
    
    // Required fields for new products
    if (!isUpdate && !data.name) {
        errors.push('El nombre del producto es requerido');
    }
    
    if (!isUpdate && (data.price === undefined || data.price === null)) {
        errors.push('El precio del producto es requerido');
    }
    
    // Type validation
    if (data.name && typeof data.name !== 'string') {
        errors.push('El nombre debe ser un texto');
    }
    
    if (data.price !== undefined && data.price !== null) {
        const price = parseFloat(data.price);
        if (isNaN(price) || price < 0) {
            errors.push('El precio debe ser un número válido mayor o igual a 0');
        } else {
            data.price = price;
        }
    }
    
    if (data.stock !== undefined && data.stock !== null) {
        const stock = parseInt(data.stock);
        if (isNaN(stock) || stock < 0) {
            errors.push('El stock debe ser un número válido mayor o igual a 0');
        } else {
            data.stock = stock;
        }
    }
    
    // Status validation
    if (data.status && !['active', 'inactive'].includes(data.status)) {
        errors.push('El estado debe ser "active" o "inactive"');
    }
    
    // Featured validation - limit to 3 featured products
    if (data.featured === 'true' || data.featured === true) {
        const currentFeatured = database.products.filter(p => p.featured && p.status === 'active');
        if (!isUpdate || (database.products.find(p => p.id === data.id)?.featured !== true)) {
            if (currentFeatured.length >= 3) {
                errors.push('Solo puede haber un máximo de 3 productos destacados');
            }
        }
        data.featured = true;
    } else {
        data.featured = false;
    }
    
    return errors;
}

// Configure multer for file uploads with real MIME validation
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, 'uploads', 'products');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'product-' + uniqueSuffix + ext);
    }
});

const fileFilter = (req, file, cb) => {
    // Real MIME type validation
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    
    if (!allowedMimes.includes(file.mimetype)) {
        return cb(new Error('Solo se permiten archivos de imagen (JPG, PNG, GIF)'), false);
    }
    
    cb(null, true);
};

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: fileFilter
});

// Serve uploaded images securely
app.get('/uploads/products/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'uploads', 'products', filename);
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Imagen no encontrada' });
    }
    
    // Validate that it's actually an image
    const ext = path.extname(filename).toLowerCase();
    const allowedExts = ['.jpg', '.jpeg', '.png', '.gif'];
    
    if (!allowedExts.includes(ext)) {
        return res.status(403).json({ error: 'Tipo de archivo no permitido' });
    }
    
    res.sendFile(filePath);
});

// Get all categories (public)
app.get('/api/categories', (req, res) => {
    try {
        res.json(database.categories);
    } catch (error) {
        writeLog('ERROR', 'Error fetching categories', { error: error.message });
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Get all categories for admin
app.get('/api/admin/categories', (req, res) => {
    try {
        const token = getTokenFromHeader(req);
        if (!validateSession(token)) {
            return res.status(401).json({ error: 'No autorizado' });
        }
        res.json(database.categories);
    } catch (error) {
        writeLog('ERROR', 'Error fetching admin categories', { error: error.message });
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Create new category
app.post('/api/admin/categories', async (req, res) => {
    try {
        const token = getTokenFromHeader(req);
        if (!validateSession(token)) {
            return res.status(401).json({ error: 'No autorizado' });
        }

        const { name, description } = req.body;

        // Validate input
        if (!name || typeof name !== 'string') {
            return res.status(400).json({ error: 'El nombre de la categoría es requerido' });
        }

        const sanitizedName = sanitizeInput(name.trim());
        const sanitizedDescription = sanitizeInput(description?.trim() || '');

        if (!sanitizedName) {
            return res.status(400).json({ error: 'El nombre de la categoría no puede estar vacío' });
        }

        // Check if category already exists
        if (database.categories.some(cat => cat.name.toLowerCase() === sanitizedName.toLowerCase())) {
            return res.status(400).json({ error: 'Ya existe una categoría con ese nombre' });
        }

        const newId = database.categories.length > 0
            ? Math.max(...database.categories.map(c => c.id)) + 1
            : 1;

        const newCategory = {
            id: newId,
            name: sanitizedName,
            description: sanitizedDescription,
            createdAt: new Date().toISOString()
        };

        database.categories.push(newCategory);

        database.activityLog.push({
            category: newCategory.name,
            action: 'Categoría añadida',
            date: new Date().toISOString()
        });

        await saveDatabase();
        writeLog('INFO', 'Category created', { categoryId: newId, name: newCategory.name });

        res.json({ success: true, category: newCategory });
    } catch (error) {
        writeLog('ERROR', 'Error creating category', { error: error.message });
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Update category
app.put('/api/admin/categories/:id', async (req, res) => {
    try {
        const token = getTokenFromHeader(req);
        if (!validateSession(token)) {
            return res.status(401).json({ error: 'No autorizado' });
        }

        const categoryId = parseInt(req.params.id, 10);
        const categoryIndex = database.categories.findIndex(c => c.id === categoryId);

        if (categoryIndex === -1) {
            return res.status(404).json({ error: 'Categoría no encontrada' });
        }

        const { name, description } = req.body;

        // Validate input
        if (!name || typeof name !== 'string') {
            return res.status(400).json({ error: 'El nombre de la categoría es requerido' });
        }

        const sanitizedName = sanitizeInput(name.trim());
        const sanitizedDescription = sanitizeInput(description?.trim() || '');

        if (!sanitizedName) {
            return res.status(400).json({ error: 'El nombre de la categoría no puede estar vacío' });
        }

        // Check if category name already exists (excluding current category)
        if (database.categories.some(cat => cat.id !== categoryId && cat.name.toLowerCase() === sanitizedName.toLowerCase())) {
            return res.status(400).json({ error: 'Ya existe una categoría con ese nombre' });
        }

        const oldCategory = database.categories[categoryIndex];
        database.categories[categoryIndex] = {
            ...database.categories[categoryIndex],
            name: sanitizedName,
            description: sanitizedDescription,
            updatedAt: new Date().toISOString()
        };

        const updatedCategory = database.categories[categoryIndex];

        database.activityLog.push({
            category: updatedCategory.name,
            action: 'Categoría actualizada',
            date: new Date().toISOString()
        });

        await saveDatabase();
        writeLog('INFO', 'Category updated', { categoryId, name: updatedCategory.name });

        res.json({ success: true, category: updatedCategory });
    } catch (error) {
        writeLog('ERROR', 'Error updating category', { error: error.message });
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Delete category
app.delete('/api/admin/categories/:id', async (req, res) => {
    try {
        const token = getTokenFromHeader(req);
        if (!validateSession(token)) {
            return res.status(401).json({ error: 'No autorizado' });
        }

        const categoryId = parseInt(req.params.id, 10);
        const categoryIndex = database.categories.findIndex(c => c.id === categoryId);

        if (categoryIndex === -1) {
            return res.status(404).json({ error: 'Categoría no encontrada' });
        }

        const deletedCategory = database.categories[categoryIndex];

        // Check if category is being used by products
        const productsUsingCategory = database.products.filter(p => p.category === deletedCategory.name);
        if (productsUsingCategory.length > 0) {
            return res.status(400).json({ 
                error: 'No se puede eliminar la categoría porque está siendo utilizada por productos',
                count: productsUsingCategory.length
            });
        }

        database.categories.splice(categoryIndex, 1);

        database.activityLog.push({
            category: deletedCategory.name,
            action: 'Categoría eliminada',
            date: new Date().toISOString()
        });

        await saveDatabase();
        writeLog('INFO', 'Category deleted', { categoryId, name: deletedCategory.name });

        res.json({ success: true });
    } catch (error) {
        writeLog('ERROR', 'Error deleting category', { error: error.message });
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// API Routes with pagination
app.get('/api/products', (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const skip = (page - 1) * limit;
        
        const activeProducts = database.products.filter(p => p.status === 'active');
        const total = activeProducts.length;
        const products = activeProducts.slice(skip, skip + limit);
        
        res.json({
            products,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        writeLog('ERROR', 'Error fetching products', { error: error.message });
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/admin/products', (req, res) => {
    try {
        const token = getTokenFromHeader(req);
        if (!validateSession(token)) {
            return res.status(401).json({ error: 'No autorizado' });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        
        const total = database.products.length;
        const products = database.products.slice(skip, skip + limit);
        
        res.json({
            products,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        writeLog('ERROR', 'Error fetching admin products', { error: error.message });
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Admin login with rate limiting
app.post('/api/admin/login', rateLimitLogin, (req, res) => {
    try {
        const { username, password } = req.body;

        const user = authenticateUser(username, password);

        if (user) {
            const token = generateSessionToken();
            const session = {
                user: { id: user.id, username: user.username, role: user.role },
                token: token,
                createdAt: Date.now(),
                expiresAt: Date.now() + (24 * 60 * 60 * 1000)
            };

            sessions.set(token, session);
            writeLog('INFO', 'User logged in successfully', { username: user.username });

            res.json({ success: true, token });
        } else {
            res.status(401).json({ success: false, message: 'Credenciales inválidas' });
        }
    } catch (error) {
        writeLog('ERROR', 'Login error', { error: error.message });
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Verify session
app.get('/api/admin/verify', (req, res) => {
    try {
        const token = getTokenFromHeader(req);
        if (!token) {
            return res.status(401).json({ valid: false });
        }

        const session = validateSession(token);
        if (session) {
            res.json({ valid: true, user: session });
        } else {
            res.status(401).json({ valid: false });
        }
    } catch (error) {
        writeLog('ERROR', 'Session verification error', { error: error.message });
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Get admin stats
app.get('/api/admin/stats', (req, res) => {
    try {
        const token = getTokenFromHeader(req);
        if (!validateSession(token)) {
            return res.status(401).json({ error: 'No autorizado' });
        }

        database.stats.totalProducts = database.products.filter(p => p.status === 'active').length;
        res.json(database.stats);
    } catch (error) {
        writeLog('ERROR', 'Error fetching stats', { error: error.message });
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Get recent activity
app.get('/api/admin/activity', (req, res) => {
    try {
        const token = getTokenFromHeader(req);
        if (!validateSession(token)) {
            return res.status(401).json({ error: 'No autorizado' });
        }

        const activity = database.activityLog.slice(-20).reverse();
        res.json(activity);
    } catch (error) {
        writeLog('ERROR', 'Error fetching activity', { error: error.message });
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Get popular products
app.get('/api/admin/popular-products', (req, res) => {
    try {
        const token = getTokenFromHeader(req);
        if (!validateSession(token)) {
            return res.status(401).json({ error: 'No autorizado' });
        }

        const popularProducts = database.products
            .filter(p => p.status === 'active')
            .slice(0, 3)
            .map(p => ({
                name: p.name,
                sales: p.sales || 0
            }));

        res.json(popularProducts);
    } catch (error) {
        writeLog('ERROR', 'Error fetching popular products', { error: error.message });
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Create new product with validation
app.post('/api/admin/products', upload.single('productImage'), async (req, res) => {
    try {
        const token = getTokenFromHeader(req);
        if (!validateSession(token)) {
            return res.status(401).json({ error: 'No autorizado' });
        }

        // Validate product data
        const validationErrors = validateProduct(req.body);
        if (validationErrors.length > 0) {
            return res.status(400).json({ error: 'Datos inválidos', details: validationErrors });
        }

        const newId = database.products.length > 0
            ? Math.max(...database.products.map(p => p.id)) + 1
            : 1;

        let imagePath = null;
        if (req.file) {
            imagePath = `/uploads/products/${req.file.filename}`;
        }

        const newProduct = {
            id: newId,
            sales: 0,
            ...req.body,
            image: imagePath,
            createdAt: new Date().toISOString()
        };

        database.products.push(newProduct);
        database.stats.totalProducts = database.products.filter(p => p.status === 'active').length;

        database.activityLog.push({
            product: newProduct.name,
            action: 'Añadido',
            date: new Date().toISOString()
        });

        await saveDatabase();
        writeLog('INFO', 'Product created', { productId: newId, name: newProduct.name });
        
        res.json({ success: true, product: newProduct });
    } catch (error) {
        writeLog('ERROR', 'Error creating product', { error: error.message });
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Update product with validation
app.put('/api/admin/products/:id', async (req, res) => {
    try {
        const token = getTokenFromHeader(req);
        if (!validateSession(token)) {
            return res.status(401).json({ error: 'No autorizado' });
        }

        const productId = parseInt(req.params.id, 10);
        const productIndex = database.products.findIndex(p => p.id === productId);

        if (productIndex === -1) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        // Validate product data
        const validationErrors = validateProduct(req.body, true);
        if (validationErrors.length > 0) {
            return res.status(400).json({ error: 'Datos inválidos', details: validationErrors });
        }

        const oldProduct = database.products[productIndex];
        database.products[productIndex] = {
            ...database.products[productIndex],
            ...req.body,
            updatedAt: new Date().toISOString()
        };

        const updatedProduct = database.products[productIndex];

        database.activityLog.push({
            product: updatedProduct.name,
            action: 'Actualizado',
            date: new Date().toISOString()
        });

        await saveDatabase();
        writeLog('INFO', 'Product updated', { productId, name: updatedProduct.name });
        
        res.json({ success: true, product: updatedProduct });
    } catch (error) {
        writeLog('ERROR', 'Error updating product', { error: error.message });
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Delete product with image cleanup
app.delete('/api/admin/products/:id', async (req, res) => {
    try {
        const token = getTokenFromHeader(req);
        if (!validateSession(token)) {
            return res.status(401).json({ error: 'No autorizado' });
        }

        const productId = parseInt(req.params.id, 10);
        const productIndex = database.products.findIndex(p => p.id === productId);

        if (productIndex === -1) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        const deletedProduct = database.products[productIndex];

        // Delete physical image if exists
        if (deletedProduct.image) {
            const filename = path.basename(deletedProduct.image);
            const imagePath = path.join(__dirname, 'uploads', 'products', filename);
            
            try {
                if (fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                    writeLog('INFO', 'Product image deleted', { filename });
                }
            } catch (error) {
                writeLog('WARNING', 'Failed to delete product image', { filename, error: error.message });
            }
        }

        database.products.splice(productIndex, 1);
        database.stats.totalProducts = database.products.filter(p => p.status === 'active').length;

        database.activityLog.push({
            product: deletedProduct.name,
            action: 'Eliminado',
            date: new Date().toISOString()
        });

        await saveDatabase();
        writeLog('INFO', 'Product deleted', { productId, name: deletedProduct.name });
        
        res.json({ success: true });
    } catch (error) {
        writeLog('ERROR', 'Error deleting product', { error: error.message });
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Logout
app.post('/api/admin/logout', (req, res) => {
    try {
        const token = getTokenFromHeader(req);
        if (token) {
            sessions.delete(token);
            writeLog('INFO', 'User logged out', { token: token.substring(0, 8) + '...' });
        }
        res.json({ success: true });
    } catch (error) {
        writeLog('ERROR', 'Logout error', { error: error.message });
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Cleanup orphaned images
app.post('/api/admin/cleanup-images', async (req, res) => {
    try {
        const token = getTokenFromHeader(req);
        if (!validateSession(token)) {
            return res.status(401).json({ error: 'No autorizado' });
        }

        const result = cleanupOrphanedImages();
        writeLog('INFO', 'Manual cleanup triggered by admin', result);
        
        let message = 'Limpieza completada';
        if (result.deletedCount > 0) {
            message = `Se eliminaron ${result.deletedCount} imágenes huérfanas de ${result.totalFiles} archivos totales`;
        } else {
            message = 'No se encontraron imágenes huérfanas';
        }
        
        res.json({ 
            success: true, 
            message,
            details: result
        });
    } catch (error) {
        writeLog('ERROR', 'Manual cleanup error', { error: error.message });
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Check orphaned images (without deleting)
app.get('/api/admin/check-orphaned-images', async (req, res) => {
    try {
        const token = getTokenFromHeader(req);
        if (!validateSession(token)) {
            return res.status(401).json({ error: 'No autorizado' });
        }

        const uploadsDir = path.join(__dirname, 'uploads', 'products');
        if (!fs.existsSync(uploadsDir)) {
            return res.json({ totalFiles: 0, orphanedFiles: [], productImages: 0 });
        }

        // Get all files in uploads directory
        const uploadedFiles = fs.readdirSync(uploadsDir);
        
        // Get all product images from database
        const productImages = new Set();
        database.products.forEach(product => {
            if (product.image) {
                const filename = path.basename(product.image);
                productImages.add(filename);
            }
        });

        // Find orphaned files (without deleting)
        const orphanedFiles = uploadedFiles.filter(file => !productImages.has(file));

        res.json({ 
            totalFiles: uploadedFiles.length,
            productImages: productImages.size,
            orphanedFiles,
            allFiles: uploadedFiles,
            productImageList: Array.from(productImages)
        });
    } catch (error) {
        writeLog('ERROR', 'Check orphaned images error', { error: error.message });
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Serve the main application
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Cleanup orphaned images
function cleanupOrphanedImages() {
    try {
        const uploadsDir = path.join(__dirname, 'uploads', 'products');
        if (!fs.existsSync(uploadsDir)) {
            return { deletedCount: 0, message: 'No uploads directory found' };
        }

        // Get all files in uploads directory
        const uploadedFiles = fs.readdirSync(uploadsDir);
        writeLog('INFO', 'Starting cleanup', { totalFiles: uploadedFiles.length, uploadsDir });
        
        // Debug: List all files found
        writeLog('DEBUG', 'Files in uploads directory', { files: uploadedFiles });
        
        // Get all product images from database
        const productImages = new Set();
        database.products.forEach(product => {
            if (product.image) {
                const filename = path.basename(product.image);
                productImages.add(filename);
                writeLog('DEBUG', 'Product image found', { productId: product.id, filename });
            }
        });
        
        writeLog('INFO', 'Product images found', { count: productImages.size, images: Array.from(productImages) });

        // Delete orphaned files
        let deletedCount = 0;
        const deletedFiles = [];
        uploadedFiles.forEach(file => {
            writeLog('DEBUG', 'Checking file', { filename: file, isOrphaned: !productImages.has(file) });
            
            if (!productImages.has(file)) {
                const filePath = path.join(uploadsDir, file);
                try {
                    // Check if it's actually a file (not directory)
                    const stats = fs.statSync(filePath);
                    if (stats.isFile()) {
                        fs.unlinkSync(filePath);
                        deletedCount++;
                        deletedFiles.push(file);
                        writeLog('INFO', 'Orphaned image deleted', { filename: file });
                    } else {
                        writeLog('WARNING', 'Skipping directory', { dirname: file });
                    }
                } catch (error) {
                    writeLog('WARNING', 'Failed to delete orphaned image', { filename: file, error: error.message });
                }
            }
        });

        const result = {
            deletedCount,
            deletedFiles,
            totalFiles: uploadedFiles.length,
            productImages: productImages.size,
            uploadsDir
        };

        if (deletedCount > 0) {
            writeLog('INFO', 'Cleanup completed', result);
        } else {
            writeLog('INFO', 'No orphaned images found', result);
        }

        return result;
    } catch (error) {
        writeLog('ERROR', 'Error during cleanup', { error: error.message });
        return { deletedCount: 0, error: error.message };
    }
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
    writeLog('INFO', 'Server started', { port: PORT });
    console.log(`Server running at http://0.0.0.0:${PORT}`);
    console.log(`Admin panel: http://0.0.0.0:${PORT}/admin/login.html`);
    
    // Run cleanup on startup
    cleanupOrphanedImages();
});

// Cleanup expired sessions
setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [token, session] of sessions.entries()) {
        if (session.expiresAt < now) {
            sessions.delete(token);
            cleanedCount++;
        }
    }
    
    if (cleanedCount > 0) {
        writeLog('INFO', 'Cleaned up expired sessions', { count: cleanedCount });
    }
}, 60000); // Every minute

// Cleanup old rate limit entries
setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [ip, attempts] of loginAttempts.entries()) {
        if (now > attempts.resetTime) {
            loginAttempts.delete(ip);
            cleanedCount++;
        }
    }
    
    if (cleanedCount > 0) {
        writeLog('DEBUG', 'Cleaned up old rate limit entries', { count: cleanedCount });
    }
}, 60000); // Every minute

// Graceful shutdown
process.on('SIGTERM', async () => {
    writeLog('INFO', 'Received SIGTERM, shutting down gracefully');
    try {
        await saveDatabase();
        process.exit(0);
    } catch (error) {
        writeLog('ERROR', 'Error during shutdown', { error: error.message });
        process.exit(1);
    }
});

process.on('SIGINT', async () => {
    writeLog('INFO', 'Received SIGINT, shutting down gracefully');
    try {
        await saveDatabase();
        process.exit(0);
    } catch (error) {
        writeLog('ERROR', 'Error during shutdown', { error: error.message });
        process.exit(1);
    }
});
