@echo off
rmdir /s /q node_modules
del package-lock.json

:: Reinstall dependencies
call npm install

:: Install required dev dependencies
call npm install -D tailwindcss@3.4.0 postcss@8.4.35 autoprefixer@10.4.17

:: Start the development server
call npm start
