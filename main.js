const electron = require('electron')
const url = require('url')
const path = require('path')

const {app, BrowserWindow, Menu, ipcMain} = electron;

const COL = 3;
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
function createAddResistorWindow(elementStr){
    addResistorWindow = new BrowserWindow({
        webPreferences: {
            nodeIntegration: true
        },  
        width: 500,
        height:500,
        title:'Add New Element'
      });
      addResistorWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'templates', 
        'addElement', elementStr + '.html'),
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

function deleteElement(firstPin, secondPin) {
    for(let i in elements) {
        let element = elements[i];
        if (element.firstPin.row == firstPin.row &&
            element.firstPin.col == firstPin.col &&
            element.secondPin.row == secondPin.row &&
            element.secondPin.col == secondPin.col) {
                delete element;
            }
    }
}

function clearAll() {
    elements = [];
}

function find_gnd_node() {
  for(let i in elements){
    let element = elements[i];
    if (element.type == 'ground') {
      return element.firstPin;
    }
  }
}

function single_digit_cord(pin) {
  return Math.trunc(pin.row * COL) + Math.trunc(pin.col);
}

function row_col_cord(pinNum) {
  return {
    row: Math.trunc(pinNum / COL),
    col: Math.trunc(pinNum % COL),
  }
}

function find_idx_set(pin, nodeSet) {
  for (let i in nodeSet) {
    if (pin in nodeSet) {
      return i;
    }
  }
  return undefined;
}

function set_node(isWire, firstPin, secondPin, nodeSet) {
  let firstSetIdx = find_idx_set(firstPin, nodeSet); 
  let secondSetIdx = find_idx_set(secondPin, nodeSet);
  if (isWire) {
    if (firstSetIdx !== undefined && secondSetIdx !== undefined) {
      nodeSet = nodeSet[firstSetIdx].concat(nodeSet[secondSetIdx]);
      nodeSet.splice(secondSetIdx, 1);
    } else if (firstSetIdx === undefined && secondSetIdx !== undefined) {
      nodeSet[secondSetIdx].push(firstPin);
    } else if (firstSetIdx !== undefined && secondSetIdx === undefined) {
      nodeSet[firstSetIdx].push(secondPin);
    } else if (firstSetIdx === undefined && secondSetIdx === undefined) {
      nodeSet.push([firstPin, secondPin]);
    }
  } else {
    if (firstSetIdx === undefined) {
      nodeSet.push([firstPin]);
    }
    if (secondSetIdx === undefined) {
      nodeSet.push([secondPin]);
    }
  }
} 

function group_nodes(nodeSet) {
  let gndNode = single_digit_cord(find_gnd_node());
  let nodeSet = [[gndNode]];
  for (let i in elements) {
    let element = elements[i];
    if (element.type != 'ground') {
      let isWire = element.type == 'wire';
      set_node(isWire,
        single_digit_cord(element.firstPin),
        single_digit_cord(element.secondPin),
        nodeSet);
    }
  }
  return nodeSet;
}

function analyze(){
  console.log('here in analyze func');
  mna_mat = [];
  mna_rhs_vector = [];
  nodeSet = [];
  nodeSet = group_nodes(nodeSet);
  
  
}

ipcMain.on('item:new', function(e, item){
    console.log(item);
    createAddResistorWindow(item);
});
// Catch item:add

ipcMain.on('board:update', function(e) {
    mainWindow.webContents.send('board:update', elements);
});

ipcMain.on('element:delete', function(e, item){
    deleteElement(item.firstPin, item.secondPin);
    mainWindow.webContents.send('board:update', elements);
});

ipcMain.on('element:clear:all', function(e) {
    console.log('on elements:clear:all');
    console.log(elements);
    clearAll();
    mainWindow.webContents.send('board:update', elements);

})
ipcMain.on('element:add', function(e, item){
    console.log(item);
    updateBoard(item);
    console.log('in resistor:add');
    console.log(elements);
    mainWindow.webContents.send('board:update', elements);
    addResistorWindow.close();
    addResistorWindow = null;
  });

  ipcMain.on('analyze', function(e) {
    result = analyze();
    mainWindow.webContents.send('analyze:result', result);
  });