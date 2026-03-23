#!/bin/bash
echo "◈ NUMORA — Starting Mission Relay Console"
echo ""

# Backend
echo "→ Starting backend (FastAPI)..."
cd backend
pip install -r requirements.txt -q
python main.py &
BACKEND_PID=$!
cd ..

sleep 2

# Frontend
echo "→ Starting frontend (React + Vite)..."
cd frontend
npm install --silent
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "◈ NUMORA Console running at http://localhost:3000"
echo "  Backend:  http://localhost:8000"
echo "  Press Ctrl+C to stop all services."
echo ""

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Shutting down.'" EXIT
wait
