@echo off
echo ===============================================================================
echo   SIH26057 - AI-Powered Marine Debris Detection Prototype
echo   Side-Scan Sonar Imagery Preprocessing + YOLOv8-Seg Inference
echo ===============================================================================
echo.

echo [1/2] Starting FastAPI Backend on http://localhost:8000 ...
start "SIH26057 Backend Server" cmd /k "cd backend && python main.py"

echo [2/2] Starting Next.js Tactical Dashboard on http://localhost:3000 ...
start "SIH26057 Frontend Dashboard" cmd /k "cd frontend && npm run dev"

echo.
echo ===============================================================================
echo   System running!
echo   - Frontend: http://localhost:3000
echo   - Backend API Docs: http://localhost:8000/docs
echo ===============================================================================
echo.
pause
