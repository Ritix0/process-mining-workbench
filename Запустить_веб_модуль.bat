@echo off
chcp 65001 > nul
title Process Mining Workbench: Реконструкция графов процессов
echo ============================================================
echo   Process Mining Workbench (ВятГУ, Кафедра ЭВМ, Группа 4302)
echo ============================================================
echo.
echo Запуск локального сервера FastAPI и открытие интерфейса...
cd /d "%~dp0backend"
start "" "http://127.0.0.1:8000"
python app.py
pause
