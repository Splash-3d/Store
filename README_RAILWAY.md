# Railway Deployment Guide

## Optimizations Applied

### 1. Railway Configuration
- ✅ Added `railway.toml` with proper build and deployment settings
- ✅ Configured health checks and restart policies
- ✅ Set production environment variables

### 2. Server Optimizations
- ✅ Server listens on `0.0.0.0` instead of `localhost`
- ✅ Ensured uploads directory exists on startup
- ✅ Proper error handling for file uploads

### 3. File Management
- ✅ Updated `.gitignore` to track uploads directory structure
- ✅ Added `.gitkeep` to maintain uploads directory in git
- ✅ Excluded uploaded files but kept directory structure

## Deployment Steps

1. **Push to GitHub Repository**
   ```bash
   git add .
   git commit -m "Optimized for Railway deployment"
   git push origin main
   ```

2. **Deploy on Railway**
   - Go to [railway.app](https://railway.app)
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository
   - Railway will automatically detect the Node.js app

3. **Environment Variables**
   Set these in Railway dashboard:
   ```
   NODE_ENV=production
   PORT=3000
   ADMIN_USERNAME=your_admin_username
   ADMIN_PASSWORD_HASH=your_password_hash
   ```

4. **Persistent Storage**
   - Railway automatically handles file uploads
   - The uploads directory will persist across deployments

## Features Ready for Production

- ✅ E-commerce store with admin panel
- ✅ Product management with image uploads
- ✅ Session-based authentication
- ✅ RESTful API endpoints
- ✅ Static file serving
- ✅ Health check endpoint

## Access URLs After Deployment

- **Main Store**: `https://your-app.railway.app/`
- **Admin Panel**: `https://your-app.railway.app/admin/login.html`

Default admin credentials (change in production):
- Username: `admin`
- Password: `admin123`

## Notes

- The app uses in-memory storage (data resets on restart)
- For production, consider adding a real database
- File uploads are stored in Railway's persistent storage
- All static assets are served efficiently
