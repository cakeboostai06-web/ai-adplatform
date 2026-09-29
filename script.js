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
        // FIXED: Relative path
        const response = await fetch('/api/current-user');
        const user = await response.json();
        
        if (user && user.email) {
            currentUser = user; 
            
            // Hide Login button, show Profile
            document.getElementById('googleLoginBtn').classList.add('d-none');
            document.getElementById('userProfileMenu').classList.remove('d-none');
            document.getElementById('userNameDisplay').innerText = user.name;
            
            // Assign the Google picture to the avatar
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

// --- WORKSPACE RESTORE LOGIC ---
function restoreWorkspace() {
    const savedCampaign = localStorage.getItem('currentCampaign');
    if (savedCampaign) {
        const data = JSON.parse(savedCampaign);
        
        document.getElementById('fbOutput').innerText = data.captionsAndTags.facebook;
        document.getElementById('igOutput').innerText = data.captionsAndTags.instagram;
        document.getElementById('waOutput').innerText = data.captionsAndTags.whatsapp;
        
        const imgLink = data.posterUrl || data.imageUrl;
        if (imgLink) document.getElementById('posterUrl').src = imgLink;

        const tagBox = document.getElementById('hashtagContainer');
        tagBox.innerHTML = '';
        data.captionsAndTags.hashtags.forEach(tag => {
            tagBox.innerHTML += `<span class="badge-tag">${tag}</span>`;
        });

        const qrWrapper = document.getElementById('qrCardWrapper');
        if (data.qrCodeUrl) {
            qrWrapper.style.display = 'block';
            document.getElementById('qrOutput').src = data.qrCodeUrl;
        } else {
            qrWrapper.style.display = 'none';
        }

        document.getElementById('emptyState').classList.add('d-none');
        document.getElementById('results').classList.remove('d-none');
    }
}
restoreWorkspace();

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
    localStorage.setItem('currentCampaign', JSON.stringify(data));
    try {
        // FIXED: Relative path
        const response = await fetch('/api/generate-campaign', {
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
// --- DOWNLOADING & PAYWALL TRIGGER (ZIP EXPORT) ---
const paywallModal = new bootstrap.Modal(document.getElementById('paywallModal'));

document.getElementById('downloadBtn').addEventListener('click', async () => {
    if (!currentUser) {
        alert("Please continue with Gmail first to save and download assets.");
        window.location.href = '/auth/google';
        return;
    }
    if (currentUser.subscription_status !== 'premium') {
        paywallModal.show();
        return;
    }
    
    const downloadBtn = document.getElementById('downloadBtn');
    const originalText = downloadBtn.innerHTML;
    downloadBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Packaging Assets...';
    downloadBtn.disabled = true;

    try {
        const savedCampaign = localStorage.getItem('currentCampaign');
        if (!savedCampaign) return alert("No campaign data found to download.");
        const data = JSON.parse(savedCampaign);

        const zip = new JSZip();

        // 1. Add Text Copy (.txt)
        const textContent = `
FACEBOOK:
${data.captionsAndTags.facebook}

INSTAGRAM:
${data.captionsAndTags.instagram}

WHATSAPP:
${data.captionsAndTags.whatsapp}

HASHTAGS:
${data.captionsAndTags.hashtags.join(' ')}
        `;
        zip.file("Social_Media_Copy.txt", textContent);

        // 2. Fetch and Add AI Poster (.png)
        const imgLink = data.posterUrl || data.imageUrl;
        if (imgLink) {
            const response = await fetch(imgLink);
            const blob = await response.blob();
            zip.file("AI_Marketing_Poster.png", blob);
        }

        // 3. Fetch and Add QR Code (.png)
        if (data.qrCodeUrl) {
            const qrResponse = await fetch(data.qrCodeUrl);
            const qrBlob = await qrResponse.blob();
            zip.file("Smart_QR_Code.png", qrBlob);
        }

        // Generate and download the ZIP
        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, "CakeBoost_Campaign_Assets.zip");

    } catch (error) {
        console.error("Download Error:", error);
        alert("Failed to package assets. Please try again.");
    } finally {
        downloadBtn.innerHTML = originalText;
        downloadBtn.disabled = false;
    }
});

// --- STRIPE CHECKOUT BUTTON ---
const checkoutBtn = document.getElementById('checkoutBtn');
if (checkoutBtn) {
    checkoutBtn.addEventListener('click', async () => {
        // Change text to show it is loading
        checkoutBtn.innerText = "Connecting to Secure Checkout...";
        checkoutBtn.disabled = true;

        try {
            // FIXED: Relative path
            const response = await fetch('/api/create-checkout-session', {
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
        // FIXED: Relative path
        window.location.href = '/auth/google';
    });
}

// --- PROFILE MANAGEMENT LOGIC ---
const profileModal = new bootstrap.Modal(document.getElementById('profileModal'));

// 1. Open Modal and Populate Data
document.getElementById('navProfileBtn').addEventListener('click', () => {
    document.getElementById('profileNameInput').value = currentUser.name;
    document.getElementById('profilePicInput').value = currentUser.picture || '';
    document.getElementById('modalAvatarPreview').src = currentUser.picture || 'https://via.placeholder.com/80';
    
    // Show Billing button ONLY if they are premium
    if (currentUser.subscription_status === 'premium') {
        document.getElementById('manageSubContainer').classList.remove('d-none');
    } else {
        document.getElementById('manageSubContainer').classList.add('d-none');
    }
    
    profileModal.show();
});

// 2. Live Image Preview
document.getElementById('profilePicInput').addEventListener('input', (e) => {
    document.getElementById('modalAvatarPreview').src = e.target.value || 'https://via.placeholder.com/80';
});

// 3. Save Profile Changes
document.getElementById('saveProfileBtn').addEventListener('click', async () => {
    const newName = document.getElementById('profileNameInput').value.trim();
    const newPic = document.getElementById('profilePicInput').value.trim();
    
    const btn = document.getElementById('saveProfileBtn');
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';
    
    try {
        await fetch('/api/update-profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName, picture: newPic })
        });
        
        // Update the UI instantly without refreshing
        currentUser.name = newName;
        currentUser.picture = newPic || currentUser.picture;
        document.getElementById('userNameDisplay').innerText = newName;
        document.getElementById('userAvatarDisplay').src = currentUser.picture;
        
        profileModal.hide();
    } catch (error) {
        alert("Failed to update profile.");
    } finally {
        btn.innerHTML = 'Save Changes';
    }
});

// 4. Stripe Customer Portal Button
document.getElementById('manageSubBtn').addEventListener('click', async () => {
    const btn = document.getElementById('manageSubBtn');
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Connecting...';
    btn.disabled = true;
    
    try {
        const response = await fetch('/api/customer-portal', { method: 'POST' });
        const data = await response.json();
        
        if (data.url) {
            window.location.href = data.url;
        } else {
            alert(data.error || "Could not open billing portal.");
            btn.innerHTML = '<i class="bi bi-credit-card me-2" style="color: #c084fc;"></i> Manage Subscription';
            btn.disabled = false;
        }
    } catch (err) {
        alert("Error connecting to secure checkout.");
        btn.innerHTML = '<i class="bi bi-credit-card me-2" style="color: #c084fc;"></i> Manage Subscription';
        btn.disabled = false;
    }
});