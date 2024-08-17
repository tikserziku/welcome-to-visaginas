const socket = io();
let currentTaskId = null;

// Инициализация Facebook SDK
window.fbAsyncInit = function() {
    FB.init({
        appId      : 'YOUR_FACEBOOK_APP_ID', // Замените на ваш App ID
        cookie     : true,
        xfbml      : true,
        version    : 'v16.0'
    });
      
    FB.AppEvents.logPageView();   
};

document.addEventListener('DOMContentLoaded', function() {
    const uploadButton = document.getElementById('uploadPhoto');
    const fileInput = document.getElementById('fileInput');
    const generateButton = document.getElementById('generateDesign');
    const fbLoginButton = document.getElementById('fbLoginButton');

    uploadButton.addEventListener('click', function() {
        fileInput.click();
    });

    fileInput.addEventListener('change', function(e) {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            if (isValidImageType(file)) {
                displayThumbnail(file);
                enableGenerateButton();
            } else {
                alert('Please select a JPEG or PNG image.');
                e.target.value = '';
            }
        }
    });

    generateButton.addEventListener('click', handleGenerateDesign);
    fbLoginButton.addEventListener('click', loginWithFacebook);

    initializeImageCounter();
});

function loginWithFacebook() {
    FB.login(function(response) {
        if (response.authResponse) {
            console.log('Welcome! Fetching your information...');
            FB.api('/me', function(response) {
                console.log('Logged in as ' + response.name);
                document.getElementById('fbLoginButton').textContent = 'Logged in as ' + response.name;
            });
        } else {
            console.log('User cancelled login or did not fully authorize.');
        }
    }, {scope: 'public_profile,email,user_photos'});
}

function isValidImageType(file) {
    const acceptedImageTypes = ['image/jpeg', 'image/png'];
    return file && acceptedImageTypes.includes(file.type);
}

function displayThumbnail(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const thumbnail = document.getElementById('photoThumbnail');
        thumbnail.src = e.target.result;
        thumbnail.classList.remove('hidden');
    }
    reader.readAsDataURL(file);
}

function enableGenerateButton() {
    const generateButton = document.getElementById('generateDesign');
    generateButton.disabled = false;
    generateButton.classList.remove('opacity-50', 'cursor-not-allowed');
}

async function handleGenerateDesign() {
    const fileInput = document.getElementById('fileInput');
    if (fileInput.files.length === 0) {
        alert('Please select a photo first');
        return;
    }

    const file = fileInput.files[0];
    if (!isValidImageType(file)) {
        alert('Please select a JPEG or PNG image.');
        return;
    }

    const formData = new FormData();
    formData.append('photo', file);
    formData.append('style', 'picasso');

    try {
        showProgressBar();
        setProgress(0);
        displayStatus('Uploading file...');
        
        clearStatusLog();

        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Upload error');
        }

        const { taskId } = await response.json();
        currentTaskId = taskId;

        clearResults();
    } catch (error) {
        console.error('Error:', error);
        hideProgressBar();
        displayError(error.message);
    }
}

socket.on('statusUpdate', (update) => {
    if (update.taskId === currentTaskId || update.taskId === '') {
        addStatusLogMessage(update.message);
    }
});

socket.on('taskUpdate', (update) => {
    if (update.taskId === currentTaskId) {
        setProgress(update.progress);
        displayStatus(getStatusMessage(update.status));
        if (update.status === 'error') {
            displayError(update.error);
        }
    }
});

socket.on('cardGenerated', (data) => {
    if (data.taskId === currentTaskId) {
        displayGreetingCard(data.cardUrl);
        postToFacebook(data.cardUrl);
    }
});

socket.on('updateImageCount', (count) => {
    updateImageCounter(count);
});

function getStatusMessage(status) {
    switch (status) {
        case 'analyzing': return 'Analyzing image...';
        case 'applying style': return 'Applying Picasso style...';
        case 'completed': return 'Processing completed';
        default: return 'Processing...';
    }
}

function displayGreetingCard(url) {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'relative';

    const img = document.createElement('img');
    img.src = url;
    img.alt = 'Greeting Card';
    img.className = 'w-full rounded-lg shadow-md mb-4';

    const textOverlay = document.createElement('div');
    textOverlay.className = 'absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-center py-4 px-2';
    textOverlay.innerHTML = '<h2 class="text-3xl font-bold">Happy Birthday Visaginas!</h2>';

    container.appendChild(img);
    container.appendChild(textOverlay);
    resultsDiv.appendChild(container);

    const downloadBtn = document.createElement('a');
    downloadBtn.href = url;
    downloadBtn.download = 'visaginas-birthday-card.png';
    downloadBtn.textContent = 'Download Card';
    downloadBtn.className = 'bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded';
    resultsDiv.appendChild(downloadBtn);

    hideProgressBar();
}

function postToFacebook(imageUrl) {
    FB.getLoginStatus(function(response) {
        if (response.status === 'connected') {
            FB.api('/me/photos', 'POST', {
                url: imageUrl,
                caption: 'My Picasso-style birthday card for Visaginas!'
            }, function(response) {
                if (!response || response.error) {
                    console.error('Error posting to Facebook', response.error);
                } else {
                    console.log('Successfully posted to Facebook!');
                    alert('Your card has been posted to Facebook!');
                }
            });
        } else {
            console.log('User is not logged in to Facebook');
            alert('Please log in to Facebook to share your card');
        }
    });
}

function showProgressBar() {
    document.querySelector('.progress-container').style.display = 'block';
}

function hideProgressBar() {
    document.querySelector('.progress-container').style.display = 'none';
}

function setProgress(percent) {
    document.querySelector('.progress-bar').style.width = `${percent}%`;
}

function displayStatus(message) {
    document.getElementById('status').textContent = message;
}

function clearResults() {
    document.getElementById('results').innerHTML = '';
}

function displayError(message) {
    document.getElementById('status').textContent = message;
    document.getElementById('status').classList.add('text-red-500');
}

function addStatusLogMessage(message) {
    const statusLog = document.getElementById('statusLog');
    const messageElement = document.createElement('p');
    messageElement.textContent = message;
    messageElement.className = 'text-sm text-gray-600';
    statusLog.appendChild(messageElement);
    statusLog.scrollTop = statusLog.scrollHeight;
}

function clearStatusLog() {
    document.getElementById('statusLog').innerHTML = '';
}

function initializeImageCounter() {
    fetch('/imageCount')
        .then(response => response.json())
        .then(data => {
            updateImageCounter(data.count);
        })
        .catch(error => console.error('Error fetching image count:', error));
}

function updateImageCounter(count) {
    document.getElementById('imageCountValue').textContent = count;
}
