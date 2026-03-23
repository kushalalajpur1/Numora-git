#!/bin/bash
echo "◈ NUMORA — Building and starting"
echo ""

echo "→ Building frontend..."
cd frontend
npm install --silent
npm run build
cd ..

echo "→ Starting backend (serves frontend + API)..."
cd backend
pip install -r requirements.txt -q
python main.py
