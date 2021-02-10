const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow

// Create a new BrowserWindow when `app` is ready
function createWindow() {

    mainWindow = new BrowserWindow({
        width: 1000, height: 800,        
        webPreferences: {
            nodeIntegration: true,
            enableRemoteModule: true
        },
        //icon:"assets/imgs/icon.ico"
        icon:path.join(__dirname,"assets/imgs/icon.ico")
    })

    // Load index.html into the new BrowserWindow
    //mainWindow.loadFile('./views/main.html')
    mainWindow.loadFile(path.join(__dirname,'views/main.html'));

    // Open DevTools - Remove for PRODUCTION!
    mainWindow.webContents.openDevTools();     // SOLO PARA DESARROLLO
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


ipcMain.handle('FILE-MAGIC-START', (event, data) => {
    console.log(data);
    /// Create your file script here 


    // DELETE TIME OUT Function I created it just for demo
    setTimeout(function () { 
        dataToReturn = {
            title: "ATTACH SOME DATA TO ME"
        }
        mainWindow.webContents.send('DONE', dataToReturn)
     }, 4000);


    // Enable these to send data back or dispatch
    // an event which can be catched
    // dataToReturn = {
    //     title: "ATTACH SOME DATA TO ME"
    // }
    // mainWindow.webContents.send('DONE', dataToReturn)
})

