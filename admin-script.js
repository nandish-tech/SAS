
class AdminSystem {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.model = null;
        this.stream = null;
        this.isDetecting = false;
        this.faceDatabase = new Map();
        this.currentTab = 'register';
        
        this.checkAdminAuth();
        this.initializeElements();
        this.loadModel();
        this.loadDatabase();
        this.updateDisplays();
    }

    checkAdminAuth() {
        if (!localStorage.getItem('adminLoggedIn')) {
            window.location.href = 'index.html';
        }
    }

    initializeElements() {
        document.getElementById('startCamera').addEventListener('click', () => this.startCamera());
        document.getElementById('stopCamera').addEventListener('click', () => this.stopCamera());
        document.getElementById('registerPerson').addEventListener('click', () => this.registerPerson());
        
        // Set today's date as default
        document.getElementById('attendanceDate').valueAsDate = new Date();
    }

    async loadModel() {
        try {
            this.updateStatus('Loading face detection model...');
            this.model = await blazeface.load();
            this.updateStatus('Model loaded successfully. Ready for registration.');
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
            
            this.updateStatus('Camera started. Ready for student registration.');
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
                    this.ctx.fillRect(start[0], start[1] - 35, 200, 30);
                    
                    this.ctx.fillStyle = 'black';
                    this.ctx.font = 'bold 16px Arial';
                    this.ctx.fillText(`Person ${index + 1}`, start[0] + 5, start[1] - 10);
                });
                
                this.updateStatus(`⚠️ Multiple people detected (${predictions.length}). Only one student should be in front of the camera for registration.`);
            } else {
                // Single face detected
                const prediction = predictions[0];
                const start = prediction.topLeft;
                const end = prediction.bottomRight;
                const size = [end[0] - start[0], end[1] - start[1]];
                
                this.ctx.strokeStyle = '#00ff00'; // Green for single face
                this.ctx.lineWidth = 3;
                this.ctx.strokeRect(start[0], start[1], size[0], size[1]);
                
                this.ctx.fillStyle = '#00ff00';
                this.ctx.fillRect(start[0], start[1] - 35, 200, 30);
                
                this.ctx.fillStyle = 'white';
                this.ctx.font = 'bold 16px Arial';
                this.ctx.fillText('Face Detected', start[0] + 5, start[1] - 10);
                
                this.updateStatus('✅ Single face detected. Ready for registration.');
            }
        } else {
            this.updateStatus('No face detected. Position student in front of camera.');
        }
        
        requestAnimationFrame(() => this.detectFaces());
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
            alert('Student already registered.');
            return;
        }

        if (!this.model || !this.stream) {
            alert('Please start the camera first.');
            return;
        }

        const predictions = await this.model.estimateFaces(this.video, false);
        
        if (predictions.length === 0) {
            alert('No face detected. Please position student in front of the camera.');
            return;
        }

        if (predictions.length > 1) {
            alert('Multiple faces detected. Please ensure only one person is in frame.');
            return;
        }

        const faceEmbedding = this.extractFaceFeatures(predictions[0]);
        
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

        await this.saveStudent(personData);
        
        this.faceDatabase.set(name, {
            name: name,
            usn: usn,
            registrationDate: personData.registrationDate,
            id: personData.id,
            embedding: faceEmbedding
        });
        
        nameInput.value = '';
        usnInput.value = '';
        this.updateStatus(`✅ ${name} (${usn}) registered successfully!`);
        this.updateRegisteredDisplay();
        this.updateStats();
    }

    async saveStudent(studentData) {
        try {
            const response = await fetch('/api/register-student', {
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
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Registration failed');
            }
        } catch (error) {
            alert('Error registering student: ' + error.message);
            throw error;
        }
    }

    async deletePerson(id) {
        if (!confirm('Are you sure you want to delete this student?')) return;
        
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
            console.log('Database not available');
        }
        
        this.faceDatabase.delete(personToDelete);
        this.updateRegisteredDisplay();
        this.updateStats();
        this.updateStatus('Student removed successfully.');
    }

    updateStatus(message) {
        document.getElementById('statusMessage').textContent = message;
    }

    updateDisplays() {
        this.updateRegisteredDisplay();
        this.updateAttendanceDisplay();
        this.updateStats();
    }

    updateRegisteredDisplay() {
        const registeredList = document.getElementById('registeredList');
        
        if (this.faceDatabase.size === 0) {
            registeredList.innerHTML = '<p>No registered students.</p>';
            return;
        }

        const registeredArray = Array.from(this.faceDatabase.values());
        registeredList.innerHTML = registeredArray.map(person => `
            <div class="registered-item">
                <div class="student-info">
                    <img src="/student-images/${person.usn || 'default'}.jpg" 
                         alt="${person.name}" 
                         class="student-image"
                         onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTAiIGhlaWdodD0iNTAiIHZpZXdCb3g9IjAgMCA1MCA1MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjUiIGN5PSIyNSIgcj0iMjUiIGZpbGw9IiNkZGQiLz4KPHN2ZyB3aWR0aD0iMzAiIGhlaWdodD0iMzAiIHZpZXdCb3g9IjAgMCAzMCAzMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4PSIxMCIgeT0iMTAiPgo8Y2lyY2xlIGN4PSIxNSIgY3k9IjEwIiByPSI1IiBmaWxsPSIjOTk5Ii8+CjxwYXRoIGQ9Im0gNSAyNSBjIDAgLTUgNSAtMTAgMTAgLTEwIHMgMTAgNSAxMCAxMCIgZmlsbD0iIzk5OSIvPgo8L3N2Zz4KPC9zdmc+'">
                    <div class="student-details">
                        <strong>${person.name}</strong><br>
                        <small>USN: ${person.usn || 'N/A'}</small><br>
                        <small>Registered: ${person.registrationDate}</small><br>
                        <small style="color: #4CAF50;">✅ Face data stored</small>
                    </div>
                </div>
                <button class="delete-btn" onclick="adminSystem.deletePerson(${person.id})">
                    Delete
                </button>
            </div>
        `).join('');
    }

    async updateAttendanceDisplay() {
        const attendanceList = document.getElementById('attendanceList');
        const selectedDate = document.getElementById('attendanceDate').value;
        const filterDate = selectedDate ? new Date(selectedDate).toDateString() : new Date().toDateString();
        
        try {
            const response = await fetch('/api/get-attendance');
            let allRecords = [];
            if (response.ok) {
                allRecords = await response.json();
            }
            
            const filteredRecords = allRecords.filter(record => record.date === filterDate);
            
            if (filteredRecords.length === 0) {
                attendanceList.innerHTML = `<p>No attendance records for ${filterDate}.</p>`;
                return;
            }

            attendanceList.innerHTML = filteredRecords
                .sort((a, b) => b.timestamp - a.timestamp)
                .map(record => `
                    <div class="attendance-item">
                        <strong>${record.name}</strong> ${record.usn ? `(${record.usn})` : ''} - ${record.time}
                    </div>
                `).join('');
        } catch (error) {
            attendanceList.innerHTML = '<p>Error loading attendance records.</p>';
        }
    }

    async updateStats() {
        try {
            const [studentsResponse, attendanceResponse] = await Promise.all([
                fetch('/api/get-students'),
                fetch('/api/get-attendance')
            ]);
            
            const students = studentsResponse.ok ? await studentsResponse.json() : [];
            const attendance = attendanceResponse.ok ? await attendanceResponse.json() : [];
            
            const today = new Date().toDateString();
            const todayAttendance = attendance.filter(record => record.date === today);
            
            document.getElementById('totalStudents').textContent = students.length;
            document.getElementById('todayCount').textContent = todayAttendance.length;
            
            const attendanceRate = students.length > 0 ? 
                Math.round((todayAttendance.length / students.length) * 100) : 0;
            document.getElementById('attendanceRate').textContent = attendanceRate + '%';
        } catch (error) {
            console.log('Error updating stats');
        }
    }

    async exportAttendance() {
        try {
            const response = await fetch('/api/get-attendance');
            if (!response.ok) return;
            
            const attendance = await response.json();
            const csvContent = "data:text/csv;charset=utf-8," 
                + "Name,USN,Date,Time\n"
                + attendance.map(record => 
                    `"${record.name}","${record.usn || 'N/A'}","${record.date}","${record.time}"`
                ).join("\n");
            
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", "attendance_records.csv");
            link.click();
        } catch (error) {
            alert('Error exporting attendance data');
        }
    }

    async clearAttendance() {
        if (!confirm('Are you sure you want to clear all attendance records? This action cannot be undone.')) {
            return;
        }
        
        try {
            const response = await fetch('/api/clear-attendance', {
                method: 'DELETE'
            });
            
            if (response.ok) {
                this.updateAttendanceDisplay();
                this.updateStats();
                this.updateStatus('All attendance records cleared successfully.');
            } else {
                throw new Error('Failed to clear attendance records');
            }
        } catch (error) {
            alert('Error clearing attendance records: ' + error.message);
        }
    }
}

// Tab functionality
function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.getElementById(tabName + '-tab').classList.add('active');
    event.target.classList.add('active');
    
    if (adminSystem) {
        adminSystem.currentTab = tabName;
        if (tabName === 'attendance') {
            adminSystem.updateAttendanceDisplay();
            adminSystem.updateStats();
        } else if (tabName === 'manage') {
            adminSystem.updateRegisteredDisplay();
        }
    }
}

function filterStudents() {
    const searchTerm = document.getElementById('searchStudent').value.toLowerCase();
    const studentItems = document.querySelectorAll('.registered-item');
    
    studentItems.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(searchTerm) ? 'flex' : 'none';
    });
}

function filterAttendance() {
    if (adminSystem) {
        adminSystem.updateAttendanceDisplay();
    }
}

function logout() {
    localStorage.removeItem('adminLoggedIn');
    window.location.href = 'index.html';
}

// Global wrapper functions for HTML onclick handlers
function exportAttendance() {
    if (adminSystem) {
        adminSystem.exportAttendance();
    }
}

function clearAttendance() {
    if (adminSystem) {
        adminSystem.clearAttendance();
    }
}

let adminSystem;
document.addEventListener('DOMContentLoaded', () => {
    adminSystem = new AdminSystem();
});

window.addEventListener('beforeunload', () => {
    if (adminSystem && adminSystem.stream) {
        adminSystem.stopCamera();
    }
});
