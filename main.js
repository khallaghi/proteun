const electron = require('electron')
const url = require('url')
const path = require('path')
const math = require('mathjs')

const fs = require('fs');  

const {app, BrowserWindow, Menu, ipcMain} = electron;

const COL = 3;
process.env.NODE_ENV = 'development';

let mainWindow;
let addResistorWindow;
let elements = [];
const filePath = path.join(__dirname,'sample_circuites', 'init-test.json');

try {
  let data = fs.readFileSync(filePath, {encoding: 'utf-8'});
  elements = JSON.parse(data);
} catch(err) {
  console.log(err.message);
}

console.log(elements);
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
    if (nodeSet[i].includes(pin)) {
      return i;
    }
  }
  return -1;
}

function set_node(isWire, firstPin, secondPin, nodeSet) {
  let firstSetIdx = find_idx_set(firstPin, nodeSet); 
  let secondSetIdx = find_idx_set(secondPin, nodeSet);
  if (isWire) {
    if (firstSetIdx !== -1 && secondSetIdx !== -1) {
      nodeSet[firstSetIdx] = nodeSet[firstSetIdx].concat(nodeSet[secondSetIdx]);
      nodeSet.splice(secondSetIdx, 1);
    } else if (firstSetIdx === -1 && secondSetIdx !== -1) {
      nodeSet[secondSetIdx].push(firstPin);
    } else if (firstSetIdx !== -1 && secondSetIdx === -1) {
      nodeSet[firstSetIdx].push(secondPin);
    } else if (firstSetIdx === -1 && secondSetIdx === -1) {
      nodeSet.push([firstPin, secondPin]);
    }
  } else {
    if (firstSetIdx === -1) {
      nodeSet.push([firstPin]);
    }
    if (secondSetIdx === -1) {
      nodeSet.push([secondPin]);
    }
  }
  return nodeSet;
} 

function group_nodes() {
  let gndNode = single_digit_cord(find_gnd_node());
  let nodeSet = [[gndNode]];
  for (let i in elements) {
    let element = elements[i];
    if (element.type != 'ground') {
      let isWire = element.type === 'wire';
      nodeSet = set_node(isWire,
        single_digit_cord(element.firstPin),
        single_digit_cord(element.secondPin),
        nodeSet);
    }
  }
  return nodeSet;
}

function exclude_gnd_node_set(nodeSet) {
  let gndNode = single_digit_cord(find_gnd_node());
  let gndSetIdx = find_idx_set(gndNode, nodeSet); 
  return nodeSet.splice(gndSetIdx, 1);
}

function group_items(nodeSet) {
  let resistors = [];
  let currentSources = [];
  let voltageSources = [];
  let vccses = [];
  let cccses = [];
  let vcvses = [];
  let ccvses = [];


  for (let i in elements) {
    let element = elements[i];
    if (element.type === 'wire' || 
        element.type === 'ground') {
          continue;
        }

    if (!element.attrs || element.attrs.amount === undefined ) {
      continue;
    }
    let item;
    if (['resistor', 'voltageSource', 'currentSource'].includes(element.type)) {
      item = {
        amount: parseInt(element.attrs.amount),
        firstSet: parseInt(find_idx_set(single_digit_cord(element.firstPin), nodeSet)),
        secondSet: parseInt(find_idx_set(single_digit_cord(element.secondPin), nodeSet))
      };
    } else if (['vccs', 'cccs', 'vccs', 'ccvs'].includes(element.type)) 
    {
      item = {
        amount: parseInt(element.attrs.amount),
        firstSet: parseInt(find_idx_set(single_digit_cord(element.firstPin), nodeSet)),
        secondSet: parseInt(find_idx_set(single_digit_cord(element.secondPin), nodeSet)),
        firstController: parseInt(find_idx_set(parseInt(element.attrs.firstController), nodeSet)),
        secondController: parseInt(find_idx_set(parseInt(element.attrs.secondController), nodeSet))
      };
    }

    if (element.type === 'resistor') {
      resistors.push(item);
    } else if (element.type === 'voltageSource') {
      voltageSources.push(item);
    } else if (element.type === 'currentSource') {
      currentSources.push(item);
    } else if (element.type === 'vccs' ) {
      vccses.push(item);
    } else if (element.type === 'cccs' ) {
      cccses.push(item);
    } else if (element.type === 'vcvs' ) {
      vcvses.push(item);
    } else if (element.type === 'ccvs' ) {
      ccvses.push(item);
    }
  }

  return {
    resistors,
    currentSources,
    voltageSources,
    vccses,
    cccses,
    vcvses,
    ccvses
  };

}

function alter_mna_mtxs(mnaMainMtx, mnaRhsMtx) {
  mnaRhsMtx.push(0);
  for(let i in mnaMainMtx) {
    mnaMainMtx[i].push(0);
  }
  mnaMainMtx.push(new Array(mnaMainMtx.length).fill(0));
}

function initial_mtx(len, nodeSetLen, voltageSources, cccses, ccvses) {
  let mapIdx = {};
  let mnaMainMtx = (new Array(len)).fill().map(() => { return new Array(len).fill(0);});
  let mnaRhsMtx = new Array(len).fill(0);
  
  for (let i in voltageSources) {
    let vlt = voltageSources[i];
    mapIdx[`${vlt.firstSet}-${vlt.secondSet}`] = nodeSetLen + parseInt(i);
  }

  for (let i in cccses) {
    let item = cccses[i];
    if (!mapIdx.hasOwnProperty(`${item.firstController}-${item.secondController}`)) {
      mapIdx[`${item.firstController}-${item.secondController}`] = mnaRhsMtx.length;
      alter_mna_mtxs(mnaMainMtx, mnaRhsMtx);
    }
  }
  

  return {
    mnaMainMtx,
    mnaRhsMtx,
    mapIdx
  };
}

function place_resistor_mna_mtx(mnaMainMtx, resistor) {
  if (resistor.firstSet !== -1) {
    mnaMainMtx[resistor.firstSet][resistor.firstSet] += 1/resistor.amount;
  } 
  if (resistor.secondSet !== -1) {
    mnaMainMtx[resistor.secondSet][resistor.secondSet] += 1/resistor.amount;
  }
  if (resistor.firstSet !== -1 && 
      resistor.secondSet !== -1) {
        mnaMainMtx[resistor.firstSet][resistor.secondSet] += -1/resistor.amount;
        mnaMainMtx[resistor.secondSet][resistor.firstSet] += -1/resistor.amount;
      }
  return mnaMainMtx;
}

function handle_resistors(resistors, mnaMainMtx) {
  for (let i in resistors) {
    let resistor = resistors[i];
    mnaMainMtx = place_resistor_mna_mtx(mnaMainMtx, resistor);
  }
  return mnaMainMtx;
}

function place_current_src_rhs_mtx(currentSrc, mnaRhsMtx) {
  if (currentSrc.firstSet !== -1) {
    mnaRhsMtx[currentSrc.firstSet] += -currentSrc.amount;
  }
  if (currentSrc.secondSet !== -1) {
    mnaRhsMtx[currentSrc.secondSet] += currentSrc.amount;
  }
  return mnaRhsMtx;
}

function handle_current_sources(currentSources, mnaRhsMtx) {
  for (let i in currentSources) {
    let currentSrc = currentSources[i];
    mnaRhsMtx = place_current_src_rhs_mtx(currentSrc, mnaRhsMtx);
  }
  return mnaRhsMtx;
}

//TODO: fix resistorsSize to nodeSet.lenght

function place_voltage_src_mna_mtx(voltageSrc, mnaMainMtx, mnaRhsMtx, resistorsSize, idx) {
  if (voltageSrc.firstSet !== -1) {
    mnaMainMtx[resistorsSize + idx][voltageSrc.firstSet] += -1;
    mnaMainMtx[voltageSrc.firstSet][resistorsSize + idx] += -1;
    mnaRhsMtx[resistorsSize + idx] += voltageSrc.amount;
  }
  if (voltageSrc.secondSet !== -1) {
    mnaMainMtx[resistorsSize + idx][voltageSrc.secondSet] += 1;
    mnaMainMtx[voltageSrc.secondSet][resistorsSize + idx] += 1;
    mnaRhsMtx[resistorsSize + idx] += voltageSrc.amount;
  }

  return {mnaMainMtx, mnaRhsMtx};

}

function handle_voltage_sources( voltageSources, mnaMainMtx, mnaRhsMtx, resistorsSize) {
  for (let i in voltageSources) {
    let voltageSrc = voltageSources[i];
    let result = place_voltage_src_mna_mtx(voltageSrc, mnaMainMtx, mnaRhsMtx, resistorsSize, parseInt(i));
    mnaMainMtx = result.mnaMainMtx;
    mnaRhsMtx = result.mnaRhsMtx;
  }

  return {
    mnaMainMtx,
    mnaRhsMtx
  };
}

function place_vccs_src_mna_mtx(vccs, mnaMainMtx) {
  if (vccs.firstSet !== -1) {
    if (vccs.firstController !== -1) {
      mnaMainMtx[vccs.firstSet][vccs.firstController] += vccs.amount;
    }
    if (vccs.secondController !== -1) {
      mnaMainMtx[vccs.firstSet][vccs.secondController] -= vccs.amount;
    }
  }
  if (vccs.secondSet !== -1) {
    if (vccs.firstController !== -1) {
      mnaMainMtx[vccs.secondSet][vccs.firstController] -= vccs.amount;
    }
    if (vccs.secondController !== -1) {
      mnaMainMtx[vccs.secondSet][vccs.secondController] += vccs.amount;
    }
  }
  return mnaMainMtx;
}

function handle_vccs(vccses, mnaMainMtx) {
  for (let i in vccses) {
    let vccs = vccses[i];
    mnaMainMtx = place_vccs_src_mna_mtx(vccs, mnaMainMtx);
  }
  return mnaMainMtx;
}

function place_vcvs_src_mna_mtx(vcvs, mnaMainMtx, firstIdx, currIdx) {
  if (vcvs.firstSet !== -1) {
    mnaMainMtx[vcvs.firstSet][firstIdx+currIdx] -= 1;
    mnaMainMtx[firstIdx+currIdx][vcvs.firstSet] -= 1;
  }

  if (vcvs.secondSet !== -1) {
    mnaMainMtx[vcvs.secondSet][firstIdx+currIdx] += 1;
    mnaMainMtx[firstIdx+currIdx][vcvs.secondSet] += 1;
  }

  if (vcvs.firstController !== -1) {
    mnaMainMtx[firstIdx+currIdx][vcvs.firstController] += parseInt(vcvs.amount);
  }

  if (vcvs.secondController !== -1) {
    mnaMainMtx[firstIdx+currIdx][vcvs.secondController] -= parseInt(vcvs.amount);
  }

  return mnaMainMtx;
}

function handle_vcvs(vcvses, mnaMainMtx, firstIdx) {
  for (let i in vcvses) {
    let vcvs = vcvses[i];
    mnaMainMtx = place_vcvs_src_mna_mtx(vcvs, mnaMainMtx, parseInt(firstIdx), parseInt(i));
  }
  return mnaMainMtx;
}
   

function place_cccs_src_mna_mtx(cccs, mnaMainMtx, cccsFirstIdx, currIdx, mapIdx) {
  let dependentCurrIdx = -1;
  if (mapIdx.hasOwnProperty(`${cccs.firstController}-${cccs.secondController}`)) {
    dependentCurrIdx = mapIdx[`${cccs.firstController}-${cccs.secondController}`];
  }
  
  if (cccs.secondSet !== -1) {
    mnaMainMtx[cccs.secondSet][cccsFirstIdx + currIdx] += 1;
  }
  if (cccs.firstSet !== -1) {
    mnaMainMtx[cccs.firstSet][cccsFirstIdx + currIdx] -= 1;
  }
  if (dependentCurrIdx !== -1) {
    if (cccs.secondController !== -1) {
      mnaMainMtx[cccs.secondController][dependentCurrIdx] += 1;
      mnaMainMtx[dependentCurrIdx][cccs.secondController] += 1;
    }
    if (cccs.firstController !== -1 && dependentCurrIdx) {
      mnaMainMtx[cccs.firstController][dependentCurrIdx] -= 1;
      mnaMainMtx[dependentCurrIdx][cccs.firstController] -= 1;
    }
    mnaMainMtx[cccsFirstIdx + currIdx][dependentCurrIdx] -= cccs.amount;
  }
  mnaMainMtx[cccsFirstIdx + currIdx][cccsFirstIdx + currIdx] += 1;
  
  return mnaMainMtx;
}

function handle_cccs(cccses, mnaMainMtx, cccsFirstIdx, mapIdx) {
  for (let i in cccses) {
    let cccs = cccses[i];
    mnaMainMtx = place_cccs_src_mna_mtx(cccs, mnaMainMtx, cccsFirstIdx, currIdx, mapIdx);
  }
  return mnaMainMtx;
}

function place_ccvs_src_mna_mtx(ccvs, mnaMainMtx, ccvsFirstIdx, mapIdx) {
  let dependentCurrIdx = -1;
  if (mapIdx.hasOwnProperty(`${cccs.firstController}-${cccs.secondController}`)) {
    dependentCurrIdx = mapIdx[`${cccs.firstController}-${cccs.secondController}`];
  }
  if (cccs.secondSet !== -1) {
    mnaMainMtx[cccs.secondSet][ccvsFirstIdx + currIdx] += 1;
    mnaMainMtx[ccvsFirstIdx + currIdx][cccs.secondSet] += 1;
  }
  if (cccs.firstSet !== -1) {
    mnaMainMtx[cccs.firstSet][ccvsFirstIdx + currIdx] -= 1;
    mnaMainMtx[ccvsFirstIdx + currIdx][cccs.firstSet] -= 1;
  }
  if (dependentCurrIdx !== -1) {
    if (cccs.secondController !== -1) {
      mnaMainMtx[cccs.secondController][dependentCurrIdx] += 1;
      mnaMainMtx[dependentCurrIdx][cccs.secondController] += 1;
    }
    if (cccs.firstController !== -1 && dependentCurrIdx) {
      mnaMainMtx[cccs.firstController][dependentCurrIdx] -= 1;
      mnaMainMtx[dependentCurrIdx][cccs.firstController] -= 1;
    }
    mnaMainMtx[ccvsFirstIdx + currIdx][dependentCurrIdx] -= ccvs.amount;
  }
  return mnaMainMtx;
}

function handle_ccvs(ccvses, mnaMainMtx, ccvsFirstIdx, mapIdx) {
  for (let i in ccvses) {
    let ccvs = ccvses[i];
    mnaMainMtx = place_ccvs_src_mna_mtx(ccvs, mnaMainMtx, ccvsFirstIdx, mapIdx);
  }
  return mnaMainMtx;
}

function solveMtx(mnaMainMtx, mnaRhsMtx) {
  return math.lusolve(mnaMainMtx, mnaRhsMtx);
}

function get_current_resistor(element, nodeSet, result) {
  let firstGroupNodeIdx = find_idx_set(single_digit_cord(element.firstPin),nodeSet);
  let secondGroupNodeIdx = find_idx_set(single_digit_cord(element.secondPin), nodeSet);
  let firstVoltage = 0, secodVoltage = 0;
  if (firstGroupNodeIdx !== -1) {
    firstVoltage = result[firstGroupNodeIdx][0];
  }
  if (secondGroupNodeIdx !== -1) {
    secodVoltage = result[secondGroupNodeIdx][0];
  }
  return (secodVoltage - firstVoltage) / parseInt(element.attrs.amount);
}

function find_voltage_src_idx(element, voltageSources, nodeSet) {
  let firstSet = find_idx_set(single_digit_cord(element.firstPin) ,nodeSet);
  let secondSet = find_idx_set(single_digit_cord(element.secondPin), nodeSet);
  for (let i in voltageSources) {
    if (parseInt(element.attrs.amount) ===
          parseInt(voltageSources[i].amount) ) {
            if (voltageSources[i].firstSet === firstSet && 
              voltageSources[i].secondSet === secondSet ) {
                return i;
              }
              if (voltageSources[i].secondSet === firstSet && 
                voltageSources[i].firstSet === secondSet ) {
                  return i;
                }
          }
  }
  return -1;
}

function calculate_currents(nodeSet, voltageSources,vcvses, cccses, ccvses , result) {
  let currents = [];
  for (let i in elements) {
    let element = elements[i];
    if (element.type === 'resistor') {
      let current = get_current_resistor(element, nodeSet, result);
      let item = {
        firstPin: element.firstPin,
        secondPin: element.secondPin,
        value: current,
        label: 'A'
      };
      currents.push(item);
    } else if (element.type === 'currentSource') {
      let item = {
        firstPin: element.firstPin,
        secondPin: element.secondPin,
        value: element.attrs.amount,
        label: 'A'
      };
      currents.push(item);
      // TODO sould check current measurment for voltage sources
    } else if (element.type === 'voltageSource') {
      let idx = find_voltage_src_idx(element, voltageSources, nodeSet);
      let current = result[nodeSet.length + idx][0];
      let item = {
        firstPin: element.firstPin,
        secondPin: element.secondPin,
        value: current,
        label: 'A'
      };
      currents.push(item);
    } else if(element.type === 'vcvs') {
      let idx = find_voltage_src_idx(element, vcvses, nodeSet);
      let current = result[nodeSet.length + voltageSources.length + idx][0];
      let item = {
        firstPin: element.firstPin,
        secondPin: element.secondPin,
        value: current,
        label: 'A'
      };
      currents.push(item);
    } else if(element.type === 'cccs') {
      let idx = find_voltage_src_idx(element, cccses, nodeSet);
      let current = result[nodeSet.length + voltageSources.length + vcvses.length + idx][0];
      let item = {
        firstPin: element.firstPin,
        secondPin: element.secondPin,
        value: current,
        label: 'A'
      };
      currents.push(item);
    } else if(element.type === 'ccvs') {
      let idx = find_voltage_src_idx(element, ccvses, nodeSet);
      let current = result[nodeSet.length + voltageSources.length +vcvses.length + cccses.length + idx][0];
      let item = {
        firstPin: element.firstPin,
        secondPin: element.secondPin,
        value: current,
        label: 'A'
      };
      currents.push(item);
    } 
  }
  return currents;
}

function analyze(){
  console.log('here in analyze func');

  let nodeSet = group_nodes();

  let gndNodeSet = exclude_gnd_node_set(nodeSet);

  let {
    resistors, 
    voltageSources, 
    currentSources, 
    vccses, 
    cccses, 
    vcvses, 
    ccvses
  } = group_items(nodeSet);
  const len = nodeSet.length + voltageSources.length + 
      vcvses.length + cccses.length + ccvses.length;
  let {mnaMainMtx, mnaRhsMtx, mapIdx} = initial_mtx(len, nodeSet.length, voltageSources, cccses, ccvses);

  mnaMainMtx = handle_resistors(resistors, mnaMainMtx);
  mnaRhsMtx = handle_current_sources(currentSources, mnaRhsMtx);
  let tmpResult = handle_voltage_sources(voltageSources, mnaMainMtx, mnaRhsMtx, resistors.length);
  mnaMainMtx = tmpResult.mnaMainMtx;
  mnaRhsMtx = tmpResult.mnaRhsMtx;

  mnaMainMtx = handle_vccs(vccses, mnaMainMtx);

  let vcvsFirstIdx = nodeSet.length + voltageSources.length;
  let cccsFirstIdx = vcvsFirstIdx + vcvses.length;
  let ccvsFirstIdx = cccsFirstIdx + cccses.length;

  mnaMainMtx = handle_vcvs(vcvses, mnaMainMtx, vcvsFirstIdx);
  
  mnaMainMtx = handle_cccs(cccses, mnaMainMtx, cccsFirstIdx, mapIdx);
  mnaMainMtx = handle_ccvs(ccvses, mnaMainMtx, ccvsFirstIdx, mapIdx);

  console.log('FILLED MAIN MTX');
  console.log(mnaMainMtx);
  console.log('FILLED RHS MTX');
  console.log(mnaRhsMtx);

  let result = solveMtx(mnaMainMtx, mnaRhsMtx);

  console.log('RESULTS');
  console.log(result);
  let currents = calculate_currents(nodeSet, voltageSources, vcvses, cccses, ccvses, result);
  console.log('CURRENTS');
  console.log(currents);
  let voltages = [];
  for (let i in nodeSet) {
    for (let j in nodeSet[i]) {
      let pin = row_col_cord(nodeSet[i][j]);
      let item = {
        row: pin.row,
        col: pin.col,
        label: 'V' + i,
        value: result[i][0]
      };
      voltages.push(item);
    }
  }
  for (let i in gndNodeSet[0]) {
    let pin = row_col_cord(gndNodeSet[0][i]);
    let item = {
      row: pin.row,
      col: pin.col,
      label: 'Vgnd',
      value: 0
    };
    voltages.push(item);
  }
  //TODO: calculate currents as well as voltages
  return {
    voltages,
    currents
  };
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
    // console.log('on elements:clear:all');
    // console.log(elements);
    clearAll();
    mainWindow.webContents.send('board:update', elements);

})
ipcMain.on('element:add', function(e, item){
    // console.log(item);
    updateBoard(item);
    // console.log('in resistor:add');
    // console.log(elements);
    mainWindow.webContents.send('board:update', elements);
    addResistorWindow.close();
    addResistorWindow = null;
  });

  ipcMain.on('analyze', function(e) {
    result = analyze();
    mainWindow.webContents.send('analyze:result', result);
  });