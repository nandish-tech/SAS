
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

// Simple in-memory database (in production, use Replit Database)
let students = [];
let attendance = [];

// Load data from files if they exist
try {
    if (fs.existsSync('students.json')) {
        students = JSON.parse(fs.readFileSync('students.json', 'utf8'));
    }
    if (fs.existsSync('attendance.json')) {
        attendance = JSON.parse(fs.readFileSync('attendance.json', 'utf8'));
    }
} catch (error) {
    console.log('Starting with empty database');
}

// Save data to files
function saveData() {
    try {
        fs.writeFileSync('students.json', JSON.stringify(students, null, 2));
        fs.writeFileSync('attendance.json', JSON.stringify(attendance, null, 2));
    } catch (error) {
        console.error('Error saving data:', error);
    }
}

// Create images directory if it doesn't exist
if (!fs.existsSync('student-images')) {
    fs.mkdirSync('student-images');
}

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const method = req.method;
    const pathname = parsedUrl.pathname;

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // API Routes
    if (pathname === '/api/get-students' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(students));
        return;
    }

    if (pathname === '/api/register-student' && method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const studentData = JSON.parse(body);
                
                // Check if USN already exists
                const existingStudent = students.find(s => s.usn === studentData.usn);
                if (existingStudent) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'USN already exists' }));
                    return;
                }

                // Save face image if provided
                if (studentData.faceImage) {
                    const imageBuffer = Buffer.from(studentData.faceImage.split(',')[1], 'base64');
                    const imagePath = `student-images/${studentData.usn}.jpg`;
                    fs.writeFileSync(imagePath, imageBuffer);
                    studentData.imagePath = imagePath;
                    delete studentData.faceImage; // Remove base64 data after saving
                }

                students.push(studentData);
                saveData();
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'Student registered successfully' }));
            } catch (error) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid data: ' + error.message }));
            }
        });
        return;
    }

    if (pathname.startsWith('/api/delete-student/') && method === 'DELETE') {
        const id = parseInt(pathname.split('/')[3]);
        const studentIndex = students.findIndex(student => student.id === id);
        
        if (studentIndex !== -1) {
            const student = students[studentIndex];
            // Delete associated image file
            if (student.imagePath && fs.existsSync(student.imagePath)) {
                fs.unlinkSync(student.imagePath);
            }
            students.splice(studentIndex, 1);
            saveData();
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Student deleted' }));
        return;
    }

    if (pathname === '/api/get-attendance' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(attendance));
        return;
    }

    if (pathname === '/api/mark-attendance' && method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const attendanceData = JSON.parse(body);
                attendance.push(attendanceData);
                saveData();
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'Attendance marked' }));
            } catch (error) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid data' }));
            }
        });
        return;
    }

    if (pathname === '/api/clear-attendance' && method === 'DELETE') {
        try {
            attendance = [];
            saveData();
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'All attendance records cleared' }));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to clear attendance records' }));
        }
        return;
    }

    // Get student by USN
    if (pathname.startsWith('/api/get-student/') && method === 'GET') {
        const usn = pathname.split('/')[3];
        const student = students.find(s => s.usn === usn);
        
        if (student) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(student));
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Student not found' }));
        }
        return;
    }

    // Serve student images
    if (pathname.startsWith('/student-images/') && method === 'GET') {
        const imagePath = '.' + pathname;
        
        if (fs.existsSync(imagePath)) {
            const ext = path.extname(imagePath).toLowerCase();
            const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';
            
            res.writeHead(200, { 'Content-Type': contentType });
            fs.createReadStream(imagePath).pipe(res);
        } else {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end('<h1>Image Not Found</h1>');
        }
        return;
    }

    // Serve static files
    let filePath = '.' + pathname;
    if (pathname === '/') {
        filePath = './index.html';
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.wav': 'audio/wav',
        '.mp4': 'video/mp4',
        '.woff': 'application/font-woff',
        '.ttf': 'application/font-ttf',
        '.eot': 'application/vnd.ms-fontobject',
        '.otf': 'application/font-otf',
        '.wasm': 'application/wasm'
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 Not Found</h1>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Face Recognition Server running on port ${PORT}`);
    console.log(`Access your app at: http://localhost:${PORT}`);
});
