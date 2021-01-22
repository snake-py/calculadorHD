const { app, BrowserWindow } = require('electron');

let mainWindow

// Create a new BrowserWindow when `app` is ready
function createWindow() {

    mainWindow = new BrowserWindow({
        width: 1000, height: 800,
        webPreferences: {
            nodeIntegration: true,
            enableRemoteModule: true
        }
    })

    // Load index.html into the new BrowserWindow
    mainWindow.loadFile('./views/main.html')

    // Open DevTools - Remove for PRODUCTION!
    mainWindow.webContents.openDevTools();
    mainWindow.setMenuBarVisibility(false)
    // Listen for window being closed
    mainWindow.on('closed', () => {
        mainWindow = null
    })
}

// Electron `app` is ready
app.on('ready', createWindow)

// Quit when all windows are closed - (Not macOS - Darwin)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})

// When app icon is clicked and app is running, (macOS) recreate the BrowserWindow
app.on('activate', () => {
    if (mainWindow === null) createWindow()
})
