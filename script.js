// Global State Variables
let currentUser = null; 

// --- VIEW NAVIGATION LOGIC ---
const generatorView = document.getElementById('generatorView');
const historyView = document.getElementById('historyView');

document.getElementById('navHomeBtn').addEventListener('click', () => {
    historyView.classList.add('d-none');
    generatorView.classList.remove('d-none');
});

document.getElementById('navHistoryBtn').addEventListener('click', () => {
    generatorView.classList.add('d-none');
    historyView.classList.remove('d-none');
});

document.getElementById('navUpgradeBtn').addEventListener('click', () => {
    paywallModal.show();
});

// --- AUTHENTICATION & PROFILE PICTURE FIX ---
async function checkAuthStatus() {
    try {
        const response = await fetch('http://localhost:3001/api/current-user');
        const user = await response.json();
        
        if (user && user.email) {
            currentUser = user; 
            
            // Hide Login button, show Profile
            document.getElementById('googleLoginBtn').classList.add('d-none');
            document.getElementById('userProfileMenu').classList.remove('d-none');
            document.getElementById('userNameDisplay').innerText = user.name;
            
            // FIX: Assign the Google picture to the avatar!
            if (user.picture) {
                document.getElementById('userAvatarDisplay').src = user.picture;
            }
            
            const badge = document.getElementById('userStatusBadge');
            if (user.subscription_status === 'premium') {
                badge.innerText = 'Premium Active';
                badge.style.background = '#10b981'; 
            } else {
                badge.innerText = 'Free Tier';
                badge.style.background = '#6b7280'; 
            }
        }
    } catch (err) {
        console.log("No user logged in yet.");
    }
}
checkAuthStatus();

// --- GENERATOR LOGIC ---
document.getElementById('includeQrToggle').addEventListener('change', (e) => {
    document.getElementById('qrFields').style.display = e.target.checked ? 'block' : 'none';
});

document.getElementById('generateBtn').addEventListener('click', async () => {
    const businessName = document.getElementById('businessName').value.trim();
    const prompt = document.getElementById('prompt').value.trim();
    const includeQr = document.getElementById('includeQrToggle').checked;
    
    const qrName = document.getElementById('qrName').value.trim();
    const qrContact = document.getElementById('qrContact').value.trim();
    const qrLocation = document.getElementById('qrLocation').value.trim();
    const qrHours = document.getElementById('qrHours').value.trim();

    if (!businessName || !prompt) {
        alert("Please enter both the Business Name and the Marketing Goal!");
        return;
    }

    document.getElementById('loading').classList.remove('d-none');
    document.getElementById('emptyState').classList.add('d-none');
    document.getElementById('results').classList.add('d-none');

    try {
        const response = await fetch('http://localhost:3001/api/generate-campaign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ businessName, prompt, includeQr, qrName, qrContact, qrLocation, qrHours })
        });

        const result = await response.json();

        if (result.status === 'success') {
            const data = result.data;
            console.log("1. Full result from server:", result);
            console.log("2. What poster URL is being sent:", data.posterUrl || data.imageUrl);
            document.getElementById('fbOutput').innerText = data.captionsAndTags.facebook;
            document.getElementById('igOutput').innerText = data.captionsAndTags.instagram;
            document.getElementById('waOutput').innerText = data.captionsAndTags.whatsapp;
            document.getElementById('posterUrl').src = result.data.posterUrl;
            document.getElementById('qrOutput').src = result.data.qrCodeUrl;

            const imgLink = data.posterUrl || data.imageUrl || data.image || data.poster || result.posterUrl || result.imageUrl;
            console.log("Final captured image link:", imgLink);
    
            if (imgLink) {
            document.getElementById('posterUrl').src = imgLink;
            }
    

            const tagBox = document.getElementById('hashtagContainer');
            tagBox.innerHTML = '';
            data.captionsAndTags.hashtags.forEach(tag => {
                tagBox.innerHTML += `<span class="badge-tag">${tag}</span>`;
            });

            document.getElementById('posterUrl').src = result.data.posterUrl;

            const qrWrapper = document.getElementById('qrCardWrapper');
            if (data.qrCodeUrl) {
                qrWrapper.style.display = 'block';
                document.getElementById('qrOutput').src = data.qrCodeUrl;
            } else {
                qrWrapper.style.display = 'none';
            }

            document.getElementById('loading').classList.add('d-none');
            document.getElementById('results').classList.remove('d-none');
        }
    } catch (err) {
        console.error(err);
        alert("Could not connect to server.");
        document.getElementById('loading').classList.add('d-none');
    }
});

// --- DOWNLOADING & PAYWALL TRIGGER ---
const paywallModal = new bootstrap.Modal(document.getElementById('paywallModal'));

document.getElementById('downloadBtn').addEventListener('click', () => {
    if (!currentUser) {
        alert("Please continue with Gmail first to save and download assets.");
        window.location.href = 'http://localhost:3001/auth/google';
        return;
    }
    if (currentUser.subscription_status !== 'premium') {
        paywallModal.show();
        return;
    }
    alert("Downloading your high-res assets! Saving to history...");
});

// --- STRIPE CHECKOUT BUTTON ---
const checkoutBtn = document.getElementById('checkoutBtn');
if (checkoutBtn) {
    checkoutBtn.addEventListener('click', async () => {
        // Change text to show it is loading
        checkoutBtn.innerText = "Connecting to Secure Checkout...";
        checkoutBtn.disabled = true;

        try {
            const response = await fetch('http://localhost:3001/api/create-checkout-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const data = await response.json();
            
            // Teleport user to Stripe
            if (data.url) {
                window.location.href = data.url; 
            } else {
                alert("Payment gateway error: " + (data.error || "Check terminal logs."));
                checkoutBtn.innerText = "Subscribe for RM35/mo";
                checkoutBtn.disabled = false;
            }
        } catch (error) {
            console.error(error);
            alert("Could not connect to payment server.");
            checkoutBtn.innerText = "Subscribe for RM35/mo";
            checkoutBtn.disabled = false;
        }
    });
}
// --- GOOGLE LOGIN BUTTON ---
const googleBtn = document.getElementById('googleLoginBtn');
if (googleBtn) {
    googleBtn.addEventListener('click', () => {
        // Adds a loading spinner so you know it is working
        googleBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Connecting...';
        window.location.href = 'http://localhost:3001/auth/google';
    });
}