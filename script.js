
class FaceRecognitionAttendance {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.model = null;
        this.stream = null;
        this.isDetecting = false;
        this.detectedPersonName = null;
        this.lastDetectionTime = 0;
        this.faceDatabase = new Map(); // Store face embeddings
        
        this.initializeElements();
        this.loadModel();
        this.loadDatabase();
        this.updateDisplay();
    }

    initializeElements() {
        document.getElementById('startCamera').addEventListener('click', () => this.startCamera());
        document.getElementById('stopCamera').addEventListener('click', () => this.stopCamera());
        document.getElementById('markAttendance').addEventListener('click', () => this.markAttendance());
        document.getElementById('registerPerson').addEventListener('click', () => this.registerPerson());
    }

    async loadModel() {
        try {
            this.updateStatus('Loading face detection model...');
            this.model = await blazeface.load();
            this.updateStatus('Model loaded successfully. Ready to start camera.');
        } catch (error) {
            this.updateStatus('Error loading model: ' + error.message);
        }
    }

    async loadDatabase() {
        try {
            // Load registered faces from database
            const response = await fetch('/api/get-students');
            if (response.ok) {
                const students = await response.json();
                students.forEach(student => {
                    if (student.faceEmbedding) {
                        this.faceDatabase.set(student.name, {
                            name: student.name,
                            embedding: new Float32Array(student.faceEmbedding),
                            registrationDate: student.registrationDate,
                            id: student.id
                        });
                    }
                });
            }
            
            // Also load from localStorage as backup
            const localFaces = JSON.parse(localStorage.getItem('registeredFaces')) || [];
            localFaces.forEach(face => {
                if (!this.faceDatabase.has(face.name)) {
                    this.faceDatabase.set(face.name, face);
                }
            });
            
            this.updateDisplay();
        } catch (error) {
            console.log('Database not available, using local storage only');
            // Fallback to localStorage
            const localFaces = JSON.parse(localStorage.getItem('registeredFaces')) || [];
            localFaces.forEach(face => {
                this.faceDatabase.set(face.name, face);
            });
        }
    }

    // Extract face features for recognition
    extractFaceFeatures(faceBox) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Extract face region
        const faceWidth = faceBox.bottomRight[0] - faceBox.topLeft[0];
        const faceHeight = faceBox.bottomRight[1] - faceBox.topLeft[1];
        
        canvas.width = 100; // Normalize size
        canvas.height = 100;
        
        ctx.drawImage(
            this.video,
            faceBox.topLeft[0], faceBox.topLeft[1],
            faceWidth, faceHeight,
            0, 0, 100, 100
        );
        
        // Get image data and create simple feature vector
        const imageData = ctx.getImageData(0, 0, 100, 100);
        const data = imageData.data;
        
        // Create simple embedding from image data
        const embedding = new Float32Array(128);
        for (let i = 0; i < 128; i++) {
            const idx = i * 4 * Math.floor(data.length / 512);
            embedding[i] = (data[idx] + data[idx + 1] + data[idx + 2]) / (3 * 255);
        }
        
        return embedding;
    }

    // Calculate similarity between two face embeddings
    calculateSimilarity(embedding1, embedding2) {
        if (!embedding1 || !embedding2) return 0;
        
        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;
        
        for (let i = 0; i < Math.min(embedding1.length, embedding2.length); i++) {
            dotProduct += embedding1[i] * embedding2[i];
            norm1 += embedding1[i] * embedding1[i];
            norm2 += embedding2[i] * embedding2[i];
        }
        
        if (norm1 === 0 || norm2 === 0) return 0;
        
        return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
    }

    // Recognize face from embedding
    recognizeFace(faceEmbedding) {
        let bestMatch = null;
        let bestSimilarity = 0;
        const threshold = 0.85; // Similarity threshold
        
        for (const [name, data] of this.faceDatabase) {
            if (data.embedding) {
                const similarity = this.calculateSimilarity(faceEmbedding, data.embedding);
                if (similarity > bestSimilarity && similarity > threshold) {
                    bestSimilarity = similarity;
                    bestMatch = {
                        name: name,
                        similarity: similarity
                    };
                }
            }
        }
        
        return bestMatch;
    }

    async startCamera() {
        try {
            this.updateStatus('Starting camera...');
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                video: { width: 640, height: 480 } 
            });
            this.video.srcObject = this.stream;
            
            this.video.onloadedmetadata = () => {
                this.canvas.width = this.video.videoWidth;
                this.canvas.height = this.video.videoHeight;
                this.startDetection();
            };
            
            this.updateStatus('Camera started. Face detection active.');
        } catch (error) {
            this.updateStatus('Error accessing camera: ' + error.message);
        }
    }

    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        this.isDetecting = false;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.updateStatus('Camera stopped.');
    }

    async startDetection() {
        this.isDetecting = true;
        await this.detectFaces();
    }

    async detectFaces() {
        if (!this.isDetecting || !this.model) return;

        const predictions = await this.model.estimateFaces(this.video, false);
        
        // Clear previous drawings
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        if (predictions.length > 0) {
            // Process the first detected face
            const prediction = predictions[0];
            const start = prediction.topLeft;
            const end = prediction.bottomRight;
            const size = [end[0] - start[0], end[1] - start[1]];
            
            // Extract face features and try to recognize
            const faceEmbedding = this.extractFaceFeatures(prediction);
            const recognition = this.recognizeFace(faceEmbedding);
            
            let displayName = 'Unknown Person - Contact Admin';
            let boxColor = '#ff0000'; // Red for unknown
            
            if (recognition) {
                displayName = recognition.name;
                boxColor = '#00ff00'; // Green for recognized
                this.detectedPersonName = recognition.name;
                this.lastDetectionTime = Date.now();
                
                this.updateStatus(`Recognized: ${displayName} (${Math.round(recognition.similarity * 100)}% confidence)`);
            } else {
                this.detectedPersonName = null;
                this.updateStatus('❌ Face detected but not recognized. Please register this person first.');
            }
            
            // Draw bounding box
            this.ctx.strokeStyle = boxColor;
            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(start[0], start[1], size[0], size[1]);
            
            // Draw name label with background
            this.ctx.fillStyle = boxColor;
            this.ctx.fillRect(start[0], start[1] - 35, Math.max(200, displayName.length * 12), 30);
            
            this.ctx.fillStyle = 'white';
            this.ctx.font = 'bold 16px Arial';
            this.ctx.fillText(displayName, start[0] + 5, start[1] - 10);
            
            // Draw additional faces if present
            for (let i = 1; i < predictions.length; i++) {
                const pred = predictions[i];
                const s = pred.topLeft;
                const e = pred.bottomRight;
                
                this.ctx.strokeStyle = '#ffff00'; // Yellow for additional faces
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(s[0], s[1], e[0] - s[0], e[1] - s[1]);
            }
            
            if (predictions.length > 1) {
                this.updateStatus(`Multiple faces detected (${predictions.length}). Focusing on primary face: ${displayName}`);
            }
        } else {
            this.detectedPersonName = null;
            this.updateStatus('No faces detected. Position yourself in front of the camera.');
        }
        
        requestAnimationFrame(() => this.detectFaces());
    }

    async markAttendance() {
        if (!this.model || !this.stream) {
            this.updateStatus('Please start the camera first.');
            return;
        }

        if (!this.detectedPersonName) {
            this.updateStatus('No recognized person detected. Please register first or position yourself properly.');
            return;
        }

        // Check if detection is recent (within 2 seconds)
        if (Date.now() - this.lastDetectionTime > 2000) {
            this.updateStatus('Person detection expired. Please position yourself in front of the camera.');
            return;
        }

        const personName = this.detectedPersonName;

        // Check if already marked attendance today
        const today = new Date().toDateString();
        const todayAttendance = await this.getTodayAttendance();
        
        const existingAttendance = todayAttendance.find(
            entry => entry.name.toLowerCase() === personName.toLowerCase() && 
            entry.date === today
        );

        if (existingAttendance) {
            this.updateStatus(`${personName} has already marked attendance today at ${existingAttendance.time}.`);
            return;
        }

        // Get student details for attendance
        const studentData = Array.from(this.faceDatabase.values()).find(student => student.name === personName);
        
        // Mark attendance
        const attendanceRecord = {
            name: personName,
            usn: studentData ? studentData.usn : 'N/A',
            time: new Date().toLocaleTimeString(),
            date: today,
            timestamp: Date.now()
        };

        await this.saveAttendance(attendanceRecord);
        
        this.updateStatus(`✅ Attendance marked successfully for ${personName}!`);
        this.updateAttendanceDisplay();
    }

    async getTodayAttendance() {
        try {
            const response = await fetch('/api/get-attendance');
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.log('Using local storage for attendance');
        }
        
        // Fallback to localStorage
        return JSON.parse(localStorage.getItem('todayAttendance')) || [];
    }

    async saveAttendance(record) {
        try {
            await fetch('/api/mark-attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(record)
            });
        } catch (error) {
            console.log('Database not available, saving to local storage');
        }
        
        // Also save to localStorage as backup
        const localAttendance = JSON.parse(localStorage.getItem('todayAttendance')) || [];
        localAttendance.push(record);
        localStorage.setItem('todayAttendance', JSON.stringify(localAttendance));
    }

    async registerPerson() {
        const nameInput = document.getElementById('personName');
        const usnInput = document.getElementById('personUSN');
        const name = nameInput.value.trim();
        const usn = usnInput.value.trim().toUpperCase();
        
        if (!name || !usn) {
            alert('Please enter both name and USN.');
            return;
        }

        if (this.faceDatabase.has(name)) {
            alert('Person already registered.');
            return;
        }

        if (!this.model || !this.stream) {
            alert('Please start the camera first.');
            return;
        }

        // Capture current face
        const predictions = await this.model.estimateFaces(this.video, false);
        
        if (predictions.length === 0) {
            alert('No face detected. Please position yourself in front of the camera.');
            return;
        }

        if (predictions.length > 1) {
            alert('Multiple faces detected. Please ensure only one person is in frame.');
            return;
        }

        // Extract face embedding and capture image
        const faceEmbedding = this.extractFaceFeatures(predictions[0]);
        
        // Capture face image
        const captureCanvas = document.createElement('canvas');
        const captureCtx = captureCanvas.getContext('2d');
        captureCanvas.width = this.video.videoWidth;
        captureCanvas.height = this.video.videoHeight;
        captureCtx.drawImage(this.video, 0, 0);
        const faceImage = captureCanvas.toDataURL('image/jpeg', 0.8);
        
        const personData = {
            name: name,
            usn: usn,
            registrationDate: new Date().toLocaleDateString(),
            id: Date.now(),
            embedding: faceEmbedding,
            faceImage: faceImage
        };

        // Save to database
        await this.saveStudent(personData);
        
        // Add to local database (without base64 image to save memory)
        this.faceDatabase.set(name, {
            name: name,
            usn: usn,
            registrationDate: personData.registrationDate,
            id: personData.id,
            embedding: faceEmbedding
        });
        
        nameInput.value = '';
        usnInput.value = '';
        this.updateStatus(`✅ ${name} (${usn}) registered successfully with face data and image!`);
        this.updateRegisteredDisplay();
    }

    async saveStudent(studentData) {
        try {
            await fetch('/api/register-student', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: studentData.name,
                    usn: studentData.usn,
                    registrationDate: studentData.registrationDate,
                    id: studentData.id,
                    faceEmbedding: Array.from(studentData.embedding),
                    faceImage: studentData.faceImage
                })
            });
        } catch (error) {
            console.log('Database not available, saving to local storage');
        }
        
        // Also save to localStorage as backup
        const localFaces = JSON.parse(localStorage.getItem('registeredFaces')) || [];
        localFaces.push({
            name: studentData.name,
            usn: studentData.usn,
            registrationDate: studentData.registrationDate,
            id: studentData.id,
            embedding: Array.from(studentData.embedding)
        });
        localStorage.setItem('registeredFaces', JSON.stringify(localFaces));
    }

    async deletePerson(id) {
        // Find person to delete
        let personToDelete = null;
        for (const [name, data] of this.faceDatabase) {
            if (data.id === id) {
                personToDelete = name;
                break;
            }
        }
        
        if (!personToDelete) return;
        
        try {
            await fetch(`/api/delete-student/${id}`, { method: 'DELETE' });
        } catch (error) {
            console.log('Database not available, deleting from local storage only');
        }
        
        // Remove from local database
        this.faceDatabase.delete(personToDelete);
        
        // Remove from localStorage
        const localFaces = JSON.parse(localStorage.getItem('registeredFaces')) || [];
        const updatedFaces = localFaces.filter(person => person.id !== id);
        localStorage.setItem('registeredFaces', JSON.stringify(updatedFaces));
        
        this.updateRegisteredDisplay();
        this.updateStatus('Person removed from registry.');
    }

    updateStatus(message) {
        document.getElementById('statusMessage').textContent = message;
    }

    updateDisplay() {
        this.updateAttendanceDisplay();
        this.updateRegisteredDisplay();
    }

    async updateAttendanceDisplay() {
        const attendanceList = document.getElementById('attendanceList');
        const today = new Date().toDateString();
        const todayRecords = await this.getTodayAttendance();
        const filteredRecords = todayRecords.filter(record => record.date === today);
        
        // Clear existing content
        attendanceList.innerHTML = '';
        
        if (filteredRecords.length === 0) {
            const noRecordsP = document.createElement('p');
            noRecordsP.textContent = 'No attendance records for today.';
            attendanceList.appendChild(noRecordsP);
            return;
        }

        filteredRecords
            .sort((a, b) => b.timestamp - a.timestamp)
            .forEach(record => {
                const attendanceItem = document.createElement('div');
                attendanceItem.className = 'attendance-item';
                
                const nameStrong = document.createElement('strong');
                nameStrong.textContent = record.name;
                attendanceItem.appendChild(nameStrong);
                
                if (record.usn) {
                    const usnSpan = document.createTextNode(` (${record.usn})`);
                    attendanceItem.appendChild(usnSpan);
                }
                
                const timeSpan = document.createTextNode(` - ${record.time}`);
                attendanceItem.appendChild(timeSpan);
                
                attendanceList.appendChild(attendanceItem);
            });
    }

    updateRegisteredDisplay() {
        const registeredList = document.getElementById('registeredList');
        
        // Clear existing content
        registeredList.innerHTML = '';
        
        if (this.faceDatabase.size === 0) {
            const noStudentsP = document.createElement('p');
            noStudentsP.textContent = 'No registered students.';
            registeredList.appendChild(noStudentsP);
            return;
        }

        const registeredArray = Array.from(this.faceDatabase.values());
        registeredArray.forEach(person => {
            // Create main container
            const registeredItem = document.createElement('div');
            registeredItem.className = 'registered-item';
            
            // Create student info container
            const studentInfo = document.createElement('div');
            studentInfo.className = 'student-info';
            
            // Create and configure image
            const img = document.createElement('img');
            img.src = `/student-images/${person.usn || 'default'}.jpg`;
            img.alt = person.name;
            img.className = 'student-image';
            img.onerror = function() {
                this.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTAiIGhlaWdodD0iNTAiIHZpZXdCb3g9IjAgMCA1MCA1MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjUiIGN5PSIyNSIgcj0iMjUiIGZpbGw9IiNkZGQiLz4KPHN2ZyB3aWR0aD0iMzAiIGhlaWdodD0iMzAiIHZpZXdCb3g9IjAgMCAzMCAzMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4PSIxMCIgeT0iMTAiPgo8Y2lyY2xlIGN4PSIxNSIgY3k9IjEwIiByPSI1IiBmaWxsPSIjOTk5Ii8+CjxwYXRoIGQ9Im0gNSAyNSBjIDAgLTUgNSAtMTAgMTAgLTEwIHMgMTAgNSAxMCAxMCIgZmlsbD0iIzk5OSIvPgo8L3N2Zz4KPC9zdmc+';
            };
            
            // Create student details container
            const studentDetails = document.createElement('div');
            studentDetails.className = 'student-details';
            
            // Create name element
            const nameStrong = document.createElement('strong');
            nameStrong.textContent = person.name;
            studentDetails.appendChild(nameStrong);
            studentDetails.appendChild(document.createElement('br'));
            
            // Create USN element
            const usnSmall = document.createElement('small');
            usnSmall.textContent = `USN: ${person.usn || 'N/A'}`;
            studentDetails.appendChild(usnSmall);
            studentDetails.appendChild(document.createElement('br'));
            
            // Create registration date element
            const regDateSmall = document.createElement('small');
            regDateSmall.textContent = `Registered: ${person.registrationDate}`;
            studentDetails.appendChild(regDateSmall);
            studentDetails.appendChild(document.createElement('br'));
            
            // Create face data status element
            const statusSmall = document.createElement('small');
            if (person.embedding) {
                statusSmall.textContent = '✅ Face data stored';
                statusSmall.style.color = '#4CAF50';
            } else {
                statusSmall.textContent = '❌ No face data';
                statusSmall.style.color = '#f44336';
            }
            studentDetails.appendChild(statusSmall);
            
            // Create delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.textContent = 'Delete';
            deleteBtn.addEventListener('click', () => {
                attendanceSystem.deletePerson(person.id);
            });
            
            // Assemble the structure
            studentInfo.appendChild(img);
            studentInfo.appendChild(studentDetails);
            registeredItem.appendChild(studentInfo);
            registeredItem.appendChild(deleteBtn);
            registeredList.appendChild(registeredItem);
        });
    }
}

// Initialize the system when page loads
let attendanceSystem;
document.addEventListener('DOMContentLoaded', () => {
    attendanceSystem = new FaceRecognitionAttendance();
});

// Clean up when page unloads
window.addEventListener('beforeunload', () => {
    if (attendanceSystem && attendanceSystem.stream) {
        attendanceSystem.stopCamera();
    }
});
