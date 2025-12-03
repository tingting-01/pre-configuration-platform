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

