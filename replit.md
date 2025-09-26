# Overview

A web-based Face Recognition Attendance System built with vanilla JavaScript, TensorFlow.js, and BlazeFace for real-time facial recognition. The system provides separate portals for students (to mark attendance) and administrators (to register students and manage records). Uses a simple file-based data storage approach with JSON files for student records and attendance logs.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Technology Stack**: Vanilla HTML5, CSS3, and JavaScript with no frameworks
- **Face Detection**: TensorFlow.js with BlazeFace model for real-time face detection in browsers
- **UI Structure**: Multi-page application with separate dashboards for students and admins
- **Camera Integration**: WebRTC getUserMedia API for camera access and video streaming
- **Canvas Processing**: HTML5 Canvas for image manipulation and face embedding extraction

## Backend Architecture  
- **Server**: Node.js HTTP server with custom routing (no framework dependencies)
- **API Design**: RESTful endpoints for student management and attendance operations
- **Data Storage**: File-based JSON storage (students.json, attendance.json) for simplicity
- **Image Storage**: Local filesystem directory (student-images) for face reference images

## Authentication & Authorization
- **Admin Access**: Simple password-based authentication with localStorage session management
- **Student Access**: Open access portal - no authentication required for attendance marking
- **Session Management**: Browser localStorage for admin session persistence

## Data Storage Solutions
- **Primary Storage**: JSON files on filesystem for student records and attendance logs
- **Image Storage**: Local filesystem directory for storing student reference images
- **Face Embeddings**: Numerical arrays stored within JSON records for face matching
- **Backup Strategy**: Manual file-based backup of JSON data files

## Core Features
- **Student Registration**: Camera-based face capture with embedding generation
- **Attendance Marking**: Real-time face recognition with duplicate prevention (once per day)
- **Admin Dashboard**: Student management, attendance viewing, and registration controls
- **Face Matching**: Cosine similarity comparison between live camera feed and stored embeddings

# External Dependencies

## Third-Party Libraries
- **TensorFlow.js**: Client-side machine learning framework for browser-based AI
- **BlazeFace Model**: Pre-trained face detection model from TensorFlow Model Garden
- **CDN Integration**: External script loading from cdn.jsdelivr.net

## Browser APIs
- **WebRTC getUserMedia**: Camera access and video streaming capabilities
- **Canvas API**: Image processing and face embedding extraction
- **LocalStorage**: Client-side session management for admin authentication
- **Fetch API**: HTTP requests for server communication

## Development Dependencies
- **Semgrep**: Code security scanning tool with custom rules configuration
- **Node.js**: Runtime environment for backend server operations