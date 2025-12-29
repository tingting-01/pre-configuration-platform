# Pre-configuration Platform

A web-based platform for managing gateway pre-configuration requests with role-based access control, template management, and workflow tracking.

## Features

- **Request Management**: Create, view, edit, and delete pre-configuration requests
- **Role-Based Access Control**: Different permissions for RAK Wireless users, external users, and admin
- **Template System**: Save and apply configuration templates
- **Workflow Tracking**: Track request status through multiple stages
- **Comments & History**: Add comments and view request history
- **Batch Export**: Export multiple requests to Excel format
- **Advanced Search**: Support for regex, wildcard, range, and fuzzy matching
- **Tag System**: Automatic and manual tagging for better organization

## Technology Stack

### Frontend
- React 18.2.0
- TypeScript
- Vite
- React Router
- Zustand (State Management)
- Axios (HTTP Client)
- Tailwind CSS
- Lucide React (Icons)
- xlsx (Excel Export)

### Backend
- FastAPI
- SQLite
- JWT Authentication
- CORS Support

### Database
- SQLite with tables for:
  - Users
  - Requests
  - Comments
  - Activities/History
  - Templates
  - Files

## Installation

### Prerequisites
- Node.js (v16 or higher)
- Python 3.8 or higher
- npm or yarn

### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Install Python dependencies:
```bash
pip install -r requirements-simple.txt
```

3. Run the backend server:
```bash
python main_simple.py
```

The backend will run on `http://localhost:8000`

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The frontend will run on `http://localhost:3000`

## Deployment

### Pre-deployment Checklist

1. **Backend Environment**
   - Ensure Python 3.8+ is installed
   - Database file `auth_prototype.db` exists (will be created automatically on first run)
   - `uploads/` directory exists for file storage

2. **Frontend Environment**
   - Ensure Node.js 16+ is installed
   - Set production API URL via environment variable

### Production Build

#### Backend

1. Install dependencies:
```bash
cd backend
pip install -r requirements-simple.txt
```

2. Run with production server:
```bash
uvicorn main_simple:app --host 0.0.0.0 --port 8000
```

#### Frontend

1. Set environment variable (optional, defaults to relative path):
```bash
export VITE_API_URL=http://your-backend-url:8000
```

2. Build for production:
```bash
cd frontend
npm install
npm run build
```

3. The built files will be in `frontend/dist/`. Serve with any static file server:
   - **Nginx**: Copy `dist/` contents to web root
   - **Node.js**: Use `npm run preview` for testing
   - **Apache**: Copy `dist/` contents to DocumentRoot

### Docker Deployment (Optional)

If using Docker Compose:

1. Ensure Docker and Docker Compose are installed

2. Update `docker-compose.yml` with production settings:
   - Set `VITE_API_URL` environment variable for frontend
   - Configure volume mounts for persistent data

3. Build and start:
```bash
docker-compose up -d --build
```

### Post-deployment

- Verify backend is accessible at configured port (default: 8000)
- Verify frontend can connect to backend API
- Check file uploads directory has write permissions
- Ensure database file has proper permissions

## Default Accounts

- **Admin**: `admin@rakwireless.com` / `rakwireless`
- **RAK Wireless User**: Any email ending with `@rakwireless.com`
- **External User**: Any other email address

## Project Structure

```
auth-prototype-separated/
├── backend/
│   ├── main_simple.py          # FastAPI backend
│   ├── requirements-simple.txt  # Python dependencies
│   ├── auth_prototype.db        # SQLite database
│   └── uploads/                 # Uploaded files
├── frontend/
│   ├── src/
│   │   ├── pages/               # Page components
│   │   ├── components/          # Reusable components
│   │   ├── services/            # API services
│   │   ├── stores/              # State management
│   │   └── utils/               # Utility functions
│   └── package.json
└── README.md
```

## Key Features Documentation

- [Permission Management](./PERMISSION_MATRIX.md)
- [Template System](./TEMPLATE_APPLICATION_MECHANISM.md)
- [Email Notification Plan](./EMAIL_NOTIFICATION_PLAN.md)

## License

[Your License Here]

