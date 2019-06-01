const electron = require('electron')
const url = require('url')
const path = require('path')

const {app, BrowserWindow, Menu, ipcMain} = electron;

process.env.NODE_ENV = 'development';

let mainWindow;
let addResistorWindow;
let elements;
// Create menu template
const mainMenuTemplate =  [
    // Each object is a dropdown
    {
      label: 'File',
      submenu:[
        {
          label:'Add Item',
          click(){
            createAddWindow();
          }
        },
        {
          label:'Clear Items',
          click(){
            mainWindow.webContents.send('item:clear');
          }
        },
        {
          label: 'Quit',
          accelerator:process.platform == 'darwin' ? 'Command+Q' : 'Ctrl+Q',
          click(){
            app.quit();
          }
        }
      ]
    }
  ];

app.on('ready', function() {
    mainWindow = new BrowserWindow({
        webPreferences: {
            nodeIntegration: true
        }
    });
    
    mainWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'templates', 'mainWindow.html'),
        protocol: 'file:',
        slashes: true
    }));

    mainWindow.on('closed', function() {
        app.quit();
    })


    // // Build menu from template
    // const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);
    // // Insert menu
    // Menu.setApplicationMenu(mainMenu);
});


// Handle add item window
function createAddWindow(){
    addWindow = new BrowserWindow({
      width: 300,
      height:200,
      title:'Add Shopping List Item'
    });
    addWindow.loadURL(url.format({
      pathname: path.join(__dirname, 'addWindow.html'),
      protocol: 'file:',
      slashes:true
    }));
    // Handle garbage collection
    addWindow.on('close', function(){
      addWindow = null;
    });
  }


  
  // If OSX, add empty object to menu
  if(process.platform == 'darwin'){
    mainMenuTemplate.unshift({});
  }
  
  // Add developer tools option if in dev
  if(process.env.NODE_ENV !== 'production'){
    mainMenuTemplate.push({
      label: 'Developer Tools',
      submenu:[
        {
          role: 'reload'
        },
        {
          label: 'Toggle DevTools',
          accelerator:process.platform == 'darwin' ? 'Command+I' : 'Ctrl+I',
          click(item, focusedWindow){
            focusedWindow.toggleDevTools();
          }
        }
      ]
    });
  }
function createAddResistorWindow(){
    addResistorWindow = new BrowserWindow({
        webPreferences: {
            nodeIntegration: true
        },  
        width: 300,
        height:200,
        title:'Add New Resistor'
      });
      addResistorWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'templates', 'addElement', 'addResistor.html'),
        protocol: 'file:',
        slashes:true
      }));
      // Handle garbage collection
      addResistorWindow.on('close', function(){
        addResistorWindow = null;
    });
}

function updateBoard(item) {
    if (elements === undefined) {
        elements = [];
    }
    console.log('elements');
    console.log(elements);
    elements.push(item);
    console.log(elements);

}
ipcMain.on('item:new', function(e, item){
    console.log(item);
    createAddResistorWindow();
    

});
// Catch item:add

ipcMain.on('resistor:add', function(e, item){
    console.log(item);
    updateBoard(item);
    console.log('in resistor:add');
    console.log(elements);
    mainWindow.webContents.send('board:update', elements);
    addResistorWindow.close();
    addResistorWindow = null;
    // mainWindow.webContents.send('resistor:add:firstPin', item);
    // addWindow.close(); 
    // Still have a reference to addWindow in memory. Need to reclaim memory (Grabage collection)
    //addWindow = null;
  });