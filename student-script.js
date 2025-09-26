
class StudentAttendance {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.model = null;
        this.stream = null;
        this.isDetecting = false;
        this.detectedPersonName = null;
        this.lastDetectionTime = 0;
        this.faceDatabase = new Map();
        
        this.initializeElements();
        this.loadModel();
        this.loadDatabase();
        this.updateAttendanceDisplay();
    }

    initializeElements() {
        document.getElementById('startCamera').addEventListener('click', () => this.startCamera());
        document.getElementById('stopCamera').addEventListener('click', () => this.stopCamera());
        document.getElementById('markAttendance').addEventListener('click', () => this.markAttendance());
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
            const response = await fetch('/api/get-students');
            if (response.ok) {
                const students = await response.json();
                students.forEach(student => {
                    if (student.faceEmbedding) {
                        this.faceDatabase.set(student.name, {
                            name: student.name,
                            usn: student.usn,
                            embedding: new Float32Array(student.faceEmbedding),
                            registrationDate: student.registrationDate,
                            id: student.id
                        });
                    }
                });
            }
        } catch (error) {
            console.log('Database not available');
        }
    }

    extractFaceFeatures(faceBox) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        const faceWidth = faceBox.bottomRight[0] - faceBox.topLeft[0];
        const faceHeight = faceBox.bottomRight[1] - faceBox.topLeft[1];
        
        canvas.width = 100;
        canvas.height = 100;
        
        ctx.drawImage(
            this.video,
            faceBox.topLeft[0], faceBox.topLeft[1],
            faceWidth, faceHeight,
            0, 0, 100, 100
        );
        
        const imageData = ctx.getImageData(0, 0, 100, 100);
        const data = imageData.data;
        
        const embedding = new Float32Array(128);
        for (let i = 0; i < 128; i++) {
            const idx = i * 4 * Math.floor(data.length / 512);
            embedding[i] = (data[idx] + data[idx + 1] + data[idx + 2]) / (3 * 255);
        }
        
        return embedding;
    }

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

    recognizeFace(faceEmbedding) {
        let bestMatch = null;
        let bestSimilarity = 0;
        const threshold = 0.85;
        
        for (const [name, data] of this.faceDatabase) {
            if (data.embedding) {
                const similarity = this.calculateSimilarity(faceEmbedding, data.embedding);
                if (similarity > bestSimilarity && similarity > threshold) {
                    bestSimilarity = similarity;
                    bestMatch = {
                        name: name,
                        usn: data.usn,
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
        
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        if (predictions.length > 0) {
            // Handle multiple faces detection
            if (predictions.length > 1) {
                // Draw yellow boxes for all faces when multiple are detected
                predictions.forEach((prediction, index) => {
                    const start = prediction.topLeft;
                    const end = prediction.bottomRight;
                    const size = [end[0] - start[0], end[1] - start[1]];
                    
                    this.ctx.strokeStyle = '#ffff00'; // Yellow for multiple faces
                    this.ctx.lineWidth = 3;
                    this.ctx.strokeRect(start[0], start[1], size[0], size[1]);
                    
                    this.ctx.fillStyle = '#ffff00';
                    this.ctx.fillRect(start[0], start[1] - 35, 220, 30);
                    
                    this.ctx.fillStyle = 'black';
                    this.ctx.font = 'bold 16px Arial';
                    this.ctx.fillText(`Person ${index + 1} - Not Identified`, start[0] + 5, start[1] - 10);
                });
                
                // Clear any previous detection data
                this.detectedPersonName = null;
                this.detectedPersonUSN = null;
                this.lastDetectionTime = 0;
                
                this.updateStatus(`⚠️ Multiple people detected (${predictions.length}). Only one student should be in front of the camera for attendance. Names cannot be identified when multiple faces are present.`);
            } else {
                // Single face detected - proceed with recognition
                const prediction = predictions[0];
                const start = prediction.topLeft;
                const end = prediction.bottomRight;
                const size = [end[0] - start[0], end[1] - start[1]];
                
                const faceEmbedding = this.extractFaceFeatures(prediction);
                const recognition = this.recognizeFace(faceEmbedding);
                
                let displayName = 'Unknown Person - Contact Admin';
                let boxColor = '#ff0000';
                
                if (recognition) {
                    displayName = `${recognition.name} (${recognition.usn})`;
                    boxColor = '#00ff00';
                    this.detectedPersonName = recognition.name;
                    this.detectedPersonUSN = recognition.usn;
                    this.lastDetectionTime = Date.now();
                    
                    this.updateStatus(`✅ Recognized: ${displayName} (${Math.round(recognition.similarity * 100)}% confidence) - Ready to mark attendance`);
                } else {
                    this.detectedPersonName = null;
                    this.detectedPersonUSN = null;
                    this.updateStatus('❌ Face detected but not recognized. Please contact admin to register your face for attendance.');
                }
                
                this.ctx.strokeStyle = boxColor;
                this.ctx.lineWidth = 3;
                this.ctx.strokeRect(start[0], start[1], size[0], size[1]);
                
                this.ctx.fillStyle = boxColor;
                this.ctx.fillRect(start[0], start[1] - 35, Math.max(280, displayName.length * 12), 30);
                
                this.ctx.fillStyle = 'white';
                this.ctx.font = 'bold 16px Arial';
                this.ctx.fillText(displayName, start[0] + 5, start[1] - 10);
            }
        } else {
            this.detectedPersonName = null;
            this.detectedPersonUSN = null;
            this.lastDetectionTime = 0;
            this.updateStatus('No faces detected. Position yourself in front of the camera.');
        }
        
        requestAnimationFrame(() => this.detectFaces());
    }

    async markAttendance() {
        if (!this.model || !this.stream) {
            this.updateStatus('Please start the camera first.');
            return;
        }

        // Check for multiple faces before marking attendance
        const predictions = await this.model.estimateFaces(this.video, false);
        if (predictions.length > 1) {
            this.updateStatus('⚠️ Multiple people detected. Only one student should be in front of the camera to mark attendance.');
            return;
        }

        if (!this.detectedPersonName) {
            this.updateStatus('No recognized person detected. Please contact admin for registration.');
            return;
        }

        if (Date.now() - this.lastDetectionTime > 2000) {
            this.updateStatus('Person detection expired. Please position yourself in front of the camera.');
            return;
        }

        const personName = this.detectedPersonName;
        const personUSN = this.detectedPersonUSN;

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

        const attendanceRecord = {
            name: personName,
            usn: personUSN,
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
        
        const localAttendance = JSON.parse(localStorage.getItem('todayAttendance')) || [];
        localAttendance.push(record);
        localStorage.setItem('todayAttendance', JSON.stringify(localAttendance));
    }

    updateStatus(message) {
        document.getElementById('statusMessage').textContent = message;
    }

    async updateAttendanceDisplay() {
        const attendanceList = document.getElementById('attendanceList');
        const today = new Date().toDateString();
        const todayRecords = await this.getTodayAttendance();
        const filteredRecords = todayRecords.filter(record => record.date === today);
        
        if (filteredRecords.length === 0) {
            attendanceList.innerHTML = '<p>No attendance records for today.</p>';
            return;
        }

        attendanceList.innerHTML = filteredRecords
            .sort((a, b) => b.timestamp - a.timestamp)
            .map(record => `
                <div class="attendance-item">
                    <strong>${record.name}</strong> ${record.usn ? `(${record.usn})` : ''} - ${record.time}
                </div>
            `).join('');
    }
}

let studentSystem;
document.addEventListener('DOMContentLoaded', () => {
    studentSystem = new StudentAttendance();
});

window.addEventListener('beforeunload', () => {
    if (studentSystem && studentSystem.stream) {
        studentSystem.stopCamera();
    }
});
