// Global variables
let products = [];
let cart = [];
let totalSales = 0;
let customerSatisfaction = 0;

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    loadProducts().then(() => {
        loadCart();
        updateStats();
    });
    setupEventListeners();
});

// Open cart modal
function openCartModal() {
    const cartModal = new bootstrap.Modal(document.getElementById('cartModal'));
    cartModal.show();
}

// Setup event listeners
function setupEventListeners() {
    // Cart functionality
    document.getElementById('cartCount')?.addEventListener('click', () => {
        openCartModal();
    });
}

// Load products from API
async function loadProducts() {
    try {
        const response = await fetch('/api/products');
        if (response.ok) {
            const data = await response.json();
            products = data.products || []; // Handle paginated response
            displayProducts();
            displayFeaturedProducts();
            updateStats();
        } else {
            console.error('Error loading products');
            products = [];
            displayProducts();
            displayFeaturedProducts();
        }
    } catch (error) {
        console.error('Error loading products:', error);
        products = [];
        displayProducts();
        displayFeaturedProducts();
    }
}

// Display products in products page
function displayProducts() {
    const container = document.getElementById('productsContainer') || document.getElementById('productsGrid');
    if (!container) return;
    
    if (products.length === 0) {
        container.innerHTML = '<div class="col-12 text-center"><p class="text-muted">No hay productos disponibles.</p></div>';
        return;
    }
    
    // Use responsive column classes
    const columnClass = window.innerWidth <= 576 ? 'col-12' : 
                       window.innerWidth <= 768 ? 'col-sm-6' : 'col-md-4';
    
    container.innerHTML = products.map(product => `
        <div class="${columnClass} mb-4">
            <div class="card product-card h-100">
                <img src="${product.image || 'https://picsum.photos/seed/product' + product.id + '/400/300'}" 
                     class="card-img-top" 
                     alt="${product.name}"
                     onerror="this.src='https://picsum.photos/seed/placeholder' + ${product.id} + '/400/300'; this.onerror=function(){this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgdmlld0JveD0iMCAwIDQwMCAzMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSI0MDAiIGhlaWdodD0iMzAwIiBmaWxsPSIjRjhGOUZDIi8+CjxwYXRoIGQ9Ik0xMzUgMTIwSDE2NlYxNDBIMTM1VjEyMFoiIGZpbGw9IiNEMUQ1REIiLz4KPHBhdGggZD0iTTE2NSAxMjBIMjM1VjE0MEgxNjVWMTIwWiIgZmlsbD0iI0QxRDVEQiIvPgo8cGF0aCBkPSJNMjM0IDEyMEgyNjVWMTQwSDIzNFYxMjBaIiBmaWxsPSIjRDFENUQ4Ii8+CjxwYXRoIGQ9Ik0xMzUgMTUwSDE2NlYxNzBIMTM1VjE1MFoiIGZpbGw9IiNEMUQ1REIiLz4KPHBhdGggZD0iTTE2NSAxNTBIMjM1VjE3MEgxNjVWMTUwWiIgZmlsbD0iI0QxRDVEQiIvPgo8cGF0aCBkPSJNMjM0IDE1MEgyNjVWMTcwSDIzNFYxNTBaIiBmaWxsPSIjRDFENUQ4Ii8+CjxwYXRoIGQ9Ik0xMzUgMTgwSDE2NlYyMDBIMTM1VjE4MFoiIGZpbGw9IiNEMUQ1REIiLz4KPHBhdGggZD0iTTE2NSAxODBIMjM1VjIwMEgxNjVWMTgwWiIgZmlsbD0iI0QxRDVEQiIvPgo8cGF0aCBkPSJNMjM0IDE4MEgyNjVWMjAwSDIzNFYxODBaIiBmaWxsPSIjRDFENUQ4Ii8+Cjx0ZXh0IHg9IjIwMCIgeT0iMjQwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjNjM3MjkxIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiPkltYWdlbiBubyBkaXNwb25pYmxlPC90ZXh0Pgo8L3N2Zz4=';}">
                <div class="card-body">
                    <h5 class="card-title">${product.name}</h5>
                    <p class="card-text">${product.description}</p>
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="badge bg-secondary">${product.category}</span>
                        <span class="badge ${product.stock > 0 ? 'bg-success' : 'bg-danger'}">${product.stock > 0 ? 'En stock' : 'Agotado'}</span>
                    </div>
                    <div class="d-flex justify-content-between align-items-center">
                        <span class="fw-bold text-success">$${parseFloat(product.price).toFixed(2)}</span>
                        <button class="btn btn-sm btn-success" onclick="addToCart(${product.id})">
                            <i class="fas fa-cart-plus"></i> Añadir
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

// Display featured products in home page
function displayFeaturedProducts() {
    const container = document.getElementById('featuredProducts');
    if (!container) return;
    
    const featuredProducts = products.filter(p => p.featured && p.status === 'active');
    if (featuredProducts.length === 0) {
        container.innerHTML = '<div class="col-12 text-center"><p class="text-muted">No hay productos destacados.</p></div>';
        return;
    }
    
    container.innerHTML = featuredProducts.map(product => `
        <div class="col-md-4 mb-4">
            <div class="card product-card h-100">
                <img src="${product.image || 'https://picsum.photos/seed/product' + product.id + '/400/300'}" class="card-img-top" alt="${product.name}">
                <div class="card-body">
                    <h5 class="card-title">${product.name}</h5>
                    <p class="card-text">${product.description.substring(0, 80)}...</p>
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="badge bg-secondary">${product.category}</span>
                        <span class="badge ${product.stock > 0 ? 'bg-success' : 'bg-danger'}">${product.stock > 0 ? 'En stock' : 'Agotado'}</span>
                    </div>
                    <div class="d-flex justify-content-between align-items-center">
                        <span class="fw-bold text-success">$${parseFloat(product.price).toFixed(2)}</span>
                        <button class="btn btn-sm btn-success" onclick="addToCart(${product.id})">
                            <i class="fas fa-cart-plus"></i> Añadir
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

// Add product to cart
function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const existingItem = cart.find(item => item.id === productId);
    
    if (existingItem) {
        existingItem.quantity++;
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            price: parseFloat(product.price),
            image: product.image,
            quantity: 1
        });
    }
    
    updateCart();
    showToast('Producto añadido al carrito', 'success');
}

// Remove from cart
function removeFromCart(productId) {
    console.log('Removing product from cart:', productId);
    console.log('Cart before removal:', cart);
    
    const initialLength = cart.length;
    cart = cart.filter(item => item.id !== productId);
    
    console.log('Cart after removal:', cart);
    console.log('Items removed:', initialLength - cart.length);
    
    updateCart();
    showToast('Producto eliminado del carrito', 'info');
}

// Update quantity in cart
function updateQuantity(productId, change) {
    const item = cart.find(item => item.id === productId);
    if (!item) return;
    
    const newQuantity = item.quantity + change;
    
    if (newQuantity <= 0) {
        removeFromCart(productId);
        return;
    }
    
    // Check stock availability
    const product = products.find(p => p.id === productId);
    if (product && newQuantity > product.stock) {
        showToast(`No hay suficiente stock. Disponible: ${product.stock}`, 'error');
        return;
    }
    
    item.quantity = newQuantity;
    updateCart();
    showToast('Cantidad actualizada', 'success');
}

// Update cart display
function updateCart() {
    const cartItems = document.getElementById('cartItems');
    const cartCount = document.getElementById('cartCount');
    const cartTotal = document.getElementById('cartTotal');
    
    if (!cartItems) return;
    
    if (cart.length === 0) {
        cartItems.innerHTML = '<p class="text-center text-muted">Tu carrito está vacío.</p>';
        if (cartCount) cartCount.textContent = '0';
        if (cartTotal) cartTotal.textContent = '0';
        return;
    }
    
    cartItems.innerHTML = cart.map(item => `
        <div class="d-flex align-items-center mb-3">
            <img src="${item.image || 'https://picsum.photos/seed/product' + item.id + '/100/100'}" alt="${item.name}" class="rounded me-3" style="width: 50px; height: 50px; object-fit: cover;">
            <div class="flex-grow-1">
                <h6 class="mb-0">${item.name}</h6>
                <div class="d-flex justify-content-between align-items-center">
                    <div class="d-flex align-items-center">
                        <button class="btn btn-sm btn-outline-secondary me-2" onclick="updateQuantity(${item.id}, -1)">
                            <i class="fas fa-minus"></i>
                        </button>
                        <span class="badge bg-secondary px-3 py-2">Cantidad: ${item.quantity}</span>
                        <button class="btn btn-sm btn-outline-secondary ms-2" onclick="updateQuantity(${item.id}, 1)">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                    <div class="d-flex align-items-center">
                        <span class="fw-bold text-success me-3">$${(item.price * item.quantity).toFixed(2)}</span>
                        <button class="btn btn-sm btn-danger" onclick="removeFromCart(${item.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
    
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    if (cartCount) cartCount.textContent = cart.reduce((sum, item) => sum + item.quantity, 0);
    if (cartTotal) cartTotal.textContent = total.toFixed(2);
    
    // Save cart to localStorage
    console.log('Saving cart to localStorage:', cart);
    localStorage.setItem('cart', JSON.stringify(cart));
    console.log('Cart saved successfully');
}

// Update stats
function updateStats() {
    const totalProductsEl = document.getElementById('totalProducts');
    if (totalProductsEl) {
        totalProductsEl.textContent = products.length;
    }
}

// Checkout
function checkout() {
    if (cart.length === 0) {
        showToast('Tu carrito está vacío', 'warning');
        return;
    }
    
    // In a real application, this would process the payment
    showToast('¡Gracias por tu compra! 🛍️', 'success');
    cart = [];
    updateCart();
    
    // Close modal
    const cartModal = bootstrap.Modal.getInstance(document.getElementById('cartModal'));
    cartModal.hide();
}

// Show toast notification
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer') || createToastContainer();
    
    const toast = document.createElement('div');
    toast.className = `alert alert-${type === 'success' ? 'alert-success' : 'alert-info'} alert-dismissible fade show position-fixed`;
    toast.style.cssText = 'top: 20px; right: 20px; z-index: 1050; min-width: 300px;';
    toast.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Create toast container if it doesn't exist
function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toastContainer';
    container.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 1050;';
    document.body.appendChild(container);
    return container;
}

// Real-time updates (simulate WebSocket connection)
function setupRealTimeUpdates() {
    // In a real application, this would connect to a WebSocket
    // For demo purposes, we'll simulate updates every 30 seconds
    
    setInterval(() => {
        // Simulate new product additions or updates
        // This would normally come from a WebSocket connection
        console.log('Checking for updates...');
    }, 30000);
}

// Load cart from localStorage
function loadCart() {
    const savedCart = localStorage.getItem('cart');
    if (savedCart) {
        cart = JSON.parse(savedCart);
        console.log('Cart loaded from localStorage:', cart);
        
        // Clean cart of products that no longer exist
        if (products.length > 0) {
            const validCart = cart.filter(item => {
                const productExists = products.some(p => p.id === item.id);
                if (!productExists) {
                    console.log('Removing invalid product from cart:', item);
                }
                return productExists;
            });
            
            if (validCart.length !== cart.length) {
                console.log('Cart cleaned:', { old: cart.length, new: validCart.length });
                cart = validCart;
                // Save the cleaned cart
                localStorage.setItem('cart', JSON.stringify(cart));
            }
        } else {
            // If no products exist, clear cart completely
            console.log('No products available, clearing cart');
            cart = [];
            localStorage.setItem('cart', JSON.stringify(cart));
        }
        
        // Additional cleanup: remove items with broken images
        cleanCartImages();
        
        updateCart();
    }
}

// Clean cart items with broken images
async function cleanCartImages() {
    const itemsToCheck = [...cart];
    const validItems = [];
    
    for (const item of itemsToCheck) {
        if (item.image && item.image.startsWith('https://')) {
            try {
                // Check if image exists
                const response = await fetch(item.image, { method: 'HEAD' });
                if (response.ok) {
                    validItems.push(item);
                } else {
                    console.log('Removing item with broken image:', item.name, item.image);
                }
            } catch (error) {
                console.log('Error checking image, removing item:', item.name, error);
                // If we can't check the image, keep the item but remove the image reference
                validItems.push({ ...item, image: null });
            }
        } else {
            // Keep items without external images
            validItems.push(item);
        }
    }
    
    if (validItems.length !== cart.length) {
        console.log('Cleaned cart from broken images:', { 
            old: cart.length, 
            new: validItems.length 
        });
        cart = validItems;
        localStorage.setItem('cart', JSON.stringify(cart));
    }
}
