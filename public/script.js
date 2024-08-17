const socket = io();
let currentTaskId = null;

document.addEventListener('DOMContentLoaded', function() {
    const uploadButton = document.getElementById('uploadPhoto');
    const fileInput = document.getElementById('fileInput');
    const generateButton = document.getElementById('generateDesign');

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
                alert('Пожалуйста, выберите изображение в формате JPEG или PNG.');
                e.target.value = '';
            }
        }
    });

    generateButton.addEventListener('click', handleGenerateDesign);

    initializeFacebookSDK();
});

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
        alert('Пожалуйста, сначала выберите фото');
        return;
    }

    const file = fileInput.files[0];
    if (!isValidImageType(file)) {
        alert('Пожалуйста, выберите изображение в формате JPEG или PNG.');
        return;
    }

    const formData = new FormData();
    formData.append('photo', file);
    formData.append('style', 'picasso');

    try {
        showProgressBar();
        setProgress(0);
        displayStatus('Загрузка файла...');
        
        clearStatusLog();

        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Ошибка загрузки');
        }

        const { taskId } = await response.json();
        currentTaskId = taskId;

        clearResults();
    } catch (error) {
        console.error('Ошибка:', error);
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
    }
});

function getStatusMessage(status) {
    switch (status) {
        case 'analyzing': return 'Анализ изображения...';
        case 'applying style': return 'Применение стиля Пикассо...';
        case 'completed': return 'Обработка завершена';
        default: return 'Обработка...';
    }
}

function displayGreetingCard(url) {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'relative';

    const img = document.createElement('img');
    img.src = url;
    img.alt = 'Поздравительная открытка';
    img.className = 'w-full rounded-lg shadow-md mb-4';

    const textOverlay = document.createElement('div');
    textOverlay.className = 'absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-center py-4 px-2';
    textOverlay.innerHTML = '<h2 class="text-3xl font-bold">С Днем Рождения, Висагинас!</h2>';

    container.appendChild(img);
    container.appendChild(textOverlay);
    resultsDiv.appendChild(container);

    const downloadBtn = document.createElement('a');
    downloadBtn.href = url;
    downloadBtn.download = 'visaginas-birthday-card.png';
    downloadBtn.textContent = 'Скачать открытку';
    downloadBtn.className = 'bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded';
    resultsDiv.appendChild(downloadBtn);

    const shareBtn = document.createElement('button');
    shareBtn.textContent = 'Поделиться на Facebook';
    shareBtn.className = 'bg-blue-600 hover:bg-blue-800 text-white font-bold py-2 px-4 rounded ml-2';
    shareBtn.onclick = () => shareOnFacebook(url);
    resultsDiv.appendChild(shareBtn);

    hideProgressBar();
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

async function initializeFacebookSDK() {
    const response = await fetch('/facebook-app-id');
    const data = await response.json();
    const appId = data.appId;

    window.fbAsyncInit = function() {
        FB.init({
            appId      : appId,
            cookie     : true,
            xfbml      : true,
            version    : 'v12.0'
        });
    };

    (function(d, s, id){
        var js, fjs = d.getElementsByTagName(s)[0];
        if (d.getElementById(id)) {return;}
        js = d.createElement(s); js.id = id;
        js.src = "https://connect.facebook.net/en_US/sdk.js";
        fjs.parentNode.insertBefore(js, fjs);
    }(document, 'script', 'facebook-jssdk'));
}

function shareOnFacebook(imageUrl) {
    FB.ui({
        method: 'share',
        href: window.location.origin + imageUrl,
    }, function(response){});
}
