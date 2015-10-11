// ==UserScript==
// @name         Lightspeed Serial Scale Bulk Items
// @namespace    https://github.com/gmkarl/lightspeedbulk/
// @version      0.1
// @description  Communicates with NCI scales to price bulk items in the Lightspeed Register.
// @author       Karl Semich
// @match        https://*.merchantos.com/register.php*
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

'use strict';

////////////////////////
// Lightspeed Backend //
////////////////////////
// These define the interface to the register window.

function LineItem(id) {
    this.id = id;
}
LineItem.fromRegisterReturn = function(result) {
    if (result.add_line && result.line_type == 'register_transaction')
        return new LineItem(result.line_id);
};
LineItem.prototype = {
    get element() {
        return document.getElementById('line_'+this.id+'_3');
    },
    get description() {
        return this.element.getElementsByClassName('register-lines-control')[0].children[0].childNodes[0].data;
    },
    editInline: function() {
        window.eval("merchantos.register.inlineEditLine('transaction_line',"+this.id+","+this.id+");");
    },
    remove: function() {
        window.eval("merchantos.register.removeLine("+this.id+");");
    }
};

function InlineEdit(id) {
    this.id = id;
    this.lineItem = new LineItem(id);
}
InlineEdit.fromRegisterReturn = function(result) {
    if (result.hasOwnProperty('inline_edit'))
        return new InlineEdit(result.line_id);
};
InlineEdit.prototype = { 
    get description() {
        return this.lineItem.description;
    },
    remove: function() {
        this.lineItem.remove();
    },
    
    get editElement() {
        return document.getElementById('transaction_line_'+this.id);
    },
    get priceElement() {
        return document.getElementById('edit_item_price_' + this.id);
    },
    get quantityElement() {
        var qtyElems = document.getElementsByName('edit_item_quantity');
        for (var i = 0; i < qtyElems.length; ++ i)
            if (this.editElement.contains(qtyElems[i]))
                return qtyElems[i];
    },
    get noteElement() {
        return document.getElementById('inline_edit_note_' + this.id);
    },
    get saveButton() {
        var ret = this.editElement.getElementsByClassName('line-buttons')[0].children[0];
        if (ret.getAttribute('data-automation') == 'saveButton')
            return ret;
    },
    save: function() {
        this.saveButton.click();
    },
    cancel: function() {
        window.eval("merchantos.register.cancelInlineEditLine("+this.id+");");
    },

    set price(p) {
        return (this.priceElement.value = p);
    },
    get price() {
        return parseFloat(this.priceElement.value);
    },
    set quantity(q) {
        return (this.quantityElement.value = q);
    },
    get quantity() {
        return parseInt(this.quantityElement.value);
    },
    set note(n) {
        return (this.noteElement.value = n);
    },
    get note() {
        return this.noteElement.value;
    }
};

// hook into functions to handle behavior
var handlers = {
    onItemSearch : function(text) {},
    onLineItem : function(item) {},
    onInlineEdit : function(edit) {},
};
(function() {
    var original_addItemSearch = unsafeWindow.merchantos.register.addItemSearch;
    unsafeWindow.merchantos.register.addItemSearch = cloneInto(function(element) {
        try {
            handlers.onItemSearch(element.value);
        } catch(e) {
            console.log("ERROR: " + e.message);
            console.log(e.stack);
        }
        return original_addItemSearch(element);
    }, unsafeWindow, {cloneFunctions:true});
    var original_ajaxRegister_Return = unsafeWindow.merchantos.register.ajaxRegister_Return;
    unsafeWindow.merchantos.register.ajaxRegister_Return = cloneInto(function(result) {
        var ret = original_ajaxRegister_Return.call(this, result);
        var item;
        try {
            if ((item = LineItem.fromRegisterReturn(result)))
                handlers.onLineItem(item);
            else if ((item = InlineEdit.fromRegisterReturn(result)))
                handlers.onInlineEdit(item);
        } catch(e) {
            console.log("Backend ERROR: " + e.message);
            console.log(e.stack);
        }
        return ret;
    }, unsafeWindow, {cloneFunctions:true});
})();


/////////////////
// NCI Backend //
/////////////////
// Defines the interface to a serial NCI scale
// requires jUART
function NCI(dev, serial) {
    this.status = "Connecting";
    this.serial = serial;
    this.port = dev;
    if (!this.serial.open(dev)) {
        throw new Error("Failed to open serial port: " + dev);
    }
    this.serial.set_option(9600,2,7,0,0);
    this.currentMessage = "";
    var self = this;
    this.serial.recv_callback(cloneInto(function(bytes, size) {
        for (var i = 0; i < size; ++ i)
            self.recvByte(bytes[i]);
    }, unsafeWindow, {cloneFunctions:true}));
}
NCI.jUART = function() {
    var plugin = unsafeWindow.document.getElementById('jUART');
    if (!plugin) {
        plugin = document.createElement('object');
        plugin.type = 'application/x-juart';
        plugin.id = 'jUART';
        document.body.appendChild(plugin);
        plugin = unsafeWindow.document.getElementById('jUART');
    }
    return plugin;
};
NCI.findScale = function(success, failure) {
    var serial = null;
    if (NCI.singleton) {
        serial = NCI.singleton.serial;
    }
    if (!serial) {
        serial = NCI.jUART().Serial;
    }
    if (!serial)
        throw new Error("jUART unavailable");
    function tryPort(nciOrPort, next) {
        try {
            var nci, port;
            if (typeof nciOrPort == "string") {
                port = nciOrPort;
                console.log("Looking for scale at " + port)
                nci = new NCI(port, serial);
            } else {
                nci = nciOrPort;
                port = nci.port;
            }
            var timeout = setTimeout(function(){
                nci.destroy();
                tryPort();
            },5000);
            nci.onStatus = function(error, status, weight, units) {
                clearTimeout(timeout);
                var invalid = nci.invalid;
                nci.onStatus = function(){};
                if (invalid) {
                    nci.destroy();
                    console.log("Device connected to " + port + " did not respond properly to NCI status request.");
                    tryPort();
                } else {
                    try {
                        success(nci);
                        NCI.singleton = nci;
                        GM_setValue('port', port);
                    } catch(e) {
                        nci.destroy();
                        console.log(e.message);
                        console.log(e.stack);
                        next();
                    }
                }
            };
            nci.requestStatus();
        } catch(e) {
            next();
        }
    }
    tryPort(NCI.singleton, function() {
        tryPort(GM_getValue('port'), function() {
            var ports = [].concat(serial.getports(),
                                  "/dev/ttyS0", "/dev/tty.serial0", "/dev/ttyUSB0", "COM0",
                                  "/dev/ttyS1", "/dev/tty.serial1", "/dev/ttyUSB1", "COM1",
                                  "/dev/ttyS2", "/dev/tty.serial2", "/dev/ttyUSB2", "COM2",
                                  "/dev/ttyS3", "/dev/tty.serial3", "/dev/ttyUSB3", "COM3",
                                  "/dev/ttyS4", "/dev/tty.serial4", "/dev/ttyUSB4", "COM4");
            var portIndex = 0;
            function tryNextPort() {
                if (portIndex >= ports.length)
                    failure();
                else
                    tryPort(ports[portIndex++], tryNextPort);
            }
            tryNextPort();
        });
    });
};
NCI.unrecognizedRE = /^\x0a\?\x0d\x03$/;
NCI.statusRE = /^\x0aS(.)(.)\x0d\x03$/;
NCI.lbozWeightRE = /^\x0a(.)LB (..\..)OZ\x0d(\x0aS..\x0d\x03)$/;
NCI.decimalWeightRE = /^\x0a(..\....)(..)\x0d(\x0aS..\x0d\x03)$/;
NCI.prototype = {
    destroy: function() {
        this.serial.recv_callback(null);
        this.serial.close();
    },
    onStatus: function(error, status, weight, units) {}, // set this to handler
    recvByte: function(byte) {
        this.currentMessage += String.fromCharCode(byte);
        if (byte == 0x03) {
            this.processMessage(this.currentMessage);
            this.currentMessage = "";
        }
    },
    processMessage: function(msg) {
        var res;
        if (NCI.unrecognizedRE.test(msg)) {
            // unrecognized command
            // <LF>?<CR><ETX>
            this.status = "Protocol error";
            this.error = true;
        } else if (NCI.statusRE.test(msg)) {
            // status message
            // <LF>Shh<CR><ETX>
            var status1 = msg.charCodeAt(2);
            var status2 = msg.charCodeAt(3);
            this.error = true;
            if (status1 & (1<<2))
                this.status = "RAM error";
            else if (status1 & (1<<3))
                this.status = "EEPROM error";
            else if (status2 & (1<<2))
                this.status = "ROM error";
            else if (status2 & (1<<3))
                this.status = "Faulty calibration";
            else if (status2 & (1<<1))
                this.status = "Over capacity";
            else if (status2 & (1<<0))
                this.status = "Under capacity";
            else if (status1 & (1<<0))
                this.status = "In motion";
            else if (status1 & (1<<1))
                this.status = "At zero";
            else if (status2 & (1<<6)) {
                var status3 = msg.charCodeAt(4);
                if ((this.error = !!(status3 & (1<<3))))
                    this.status = "Initial zero error";
                else if (status3 & (1<<2))
                    this.status = "Net weight";
                else
                    this.status = "Gross weight";
            } else {
                this.error = false;
                this.status = "Weight";
            }
            this.onStatus(this.error, this.status, this.weight, this.units);
        } else if ((res = NCI.lbozWeightRE.exec(msg))) {
            // lb-oz weight message
            // <LF>xLB<SP>xx.xOZ<CR><LF>Shh<CR><ETX>
            var lbs = parseInt(res[1]);
            var ozs = parseFloat(res[2]);
            this.weight = lbs + ozs / 16.0;
            this.units = "LB";
            this.processMessage(res[3]);
        } else if ((res = NCI.decimalWeightRE.exec(msg))) {
            // decimal lb weight message
            // <LF>xx.xxxUU<CR><LF>Shh<CR><ETX>
            this.weight = parseFloat(res[1]);
            this.units = res[2];
            this.processMessage(res[3]);
        } else if (this.status == "Connecting") {
            // this invalid message was hopefully the tail end of a partial message.
            this.status = "Connected";
        } else {
            console.log(msg);
            this.error = true;
            this.status = "Protocol Error";
            this.invalid = true;
            this.onStatus(this.error, this.status, this.weight, this.units);
        }
    },
    sendCommand: function(cmd) {
        this.serial.send(cmd);
        this.serial.send(0x0d);
    },
    requestWeight: function() {
        this.sendCommand('W');
    },
    requestStatus: function() {
        this.sendCommand('S');
    },
    zeroScale: function() {
        this.sendCommand('Z');
    }
};


///////////////////////
// Weight GUI Prompt //
///////////////////////

var weightPromptElement = document.createElement('table');
weightPromptElement.innerHTML =
    '<tbody><tr>' +
    '<td class="line-description"></td>' +
    '<td><label for="edit_item_weight">Weight</label></td>' +
    '<td><input name="edit_item_weight" type="number" class="number" tabindex="2000" size="5" maxlength="15" style="margin-right:-18px; padding-right:18px">lb &nbsp;</td>' +
    '<td class="line-buttons">' +
    '<button tabindex="2001" class="save-button">Save</button>' +
    '<button tabindex="2002" class="cancel-button">Cancel</button>' +
    '</td>' +
    '</tr></tbody>';

function weightPrompt(edit, callback, cancel) {
    var promptElement = weightPromptElement.cloneNode(true);
    var editItemWeightElement = promptElement.getElementsByClassName('number')[0];
    var saveElement = promptElement.getElementsByClassName('save-button')[0];
    var cancelElement = promptElement.getElementsByClassName('cancel-button')[0];
    var scaleStatusElement = document.createTextNode("");
    var scale;
    editItemWeightElement.parentElement.appendChild(scaleStatusElement);
    editItemWeightElement.onkeypress = function(event) {
        if (unsafeWindow.onEnterKey(event, cloneInto(
                                        function(){save();},
                                        unsafeWindow,
                                        {cloneFunctions:true}
                                    )))
            return false;
    };
    editItemWeightElement.id = 'edit_item_weight_' + edit.id;
    saveElement.onclick = function() {
        return save();
    };
    saveElement.id = 'save_element_weight_' + edit.id;
    if (document.getElementById(saveElement.id))
        document.getElementById(saveElement.id).click();
    cancelElement.onclick = function() {
        cleanup();
        cancel();
        return false;
    };
    promptElement.getElementsByClassName('line-description')[0].innerText = edit.description;

    function cleanup() {
        if (scale) scale.onStatus = function(){};
        scale = null;
        editItemWeightElement.onkeypress = null;
        saveElement.onclick = null;
        cancelElement.onclick = null;
        promptElement = null;
        editItemWeightElement = null;
        scaleStatusElement = null;
        saveElement = null;
        cancelElement = null;
    }
    
    function save() {
        var lbs = parseFloat(editItemWeightElement.value);
        if (!lbs) {
            cancel();
        } else {
            cleanup();
            callback(lbs);
        }
        return false;
    }
    
    edit.editElement.parentElement.appendChild(promptElement);
    edit.editElement.style.display = 'none';
    window.eval("merchantos.focus.set('"+editItemWeightElement.id+"');");
    
    function scaleFound(nci) {
        scaleStatusElement.data = "Scale: found";
        scale = nci;
        scale.onStatus = function(error, status, weight, units) {
            scaleStatusElement.data = "Scale: " + status;
            if (!error && units && weight) {
                if (units != 'LB') {
                    scaleStatusElement.data = "Scale: " + units + " not LBs";
                } else {
                    scaleStatusElement.data = "";
                    editItemWeightElement.value = weight;
                    save();
                    return;
                }
            }
            scale.requestWeight();
        };
        scale.requestWeight();
    }
    
    function noScaleFound() {
        scaleStatusElement.data = "Scale: not found";
    }
    
    function lookForScale() {
        scaleStatusElement.data = "Scale: searching ...";
        try {
            NCI.findScale(scaleFound, noScaleFound);
        } catch(e) {
            scaleStatusElement.data = "Scale: " + e.message;
        }
    }
    
    lookForScale();    
}



////////////////////////
// Main Functionality //
////////////////////////

// bulk item descriptions end in "$x.xx/lb"
var bulkRE = /\$([0-9\.]*)\/(#|lb|oz)$/;

var STATE = "user";

handlers.onItemSearch = function(text) {
    STATE = "itemSearch";
};

handlers.onLineItem = function(item) {
    if (STATE == "itemSearch") {
        if (item.description.match(bulkRE)) {
            STATE = "editAuto_" + item.id;
            item.editInline();
        } else {
            STATE = "user";
        }
    } else if (STATE == "editSave") {
        STATE = "user";
    }
};

handlers.onInlineEdit = function(edit) {
    if (STATE == "editAuto_" + edit.id) {
        edit.quantity = 1;

        var bulkMatch = edit.description.match(bulkRE);
        var unitPrice = parseFloat(bulkMatch[1]);
        var unit = bulkMatch[2];
        // popup weight dialog
        weightPrompt(edit, function(lbs){
            var note;
            if (unit == "oz") {
                note = (lbs * 16) + " oz";
                unitPrice *= 16;
            } else {
                note = lbs + " lb";
            }
            var newPrice = Math.ceil(unitPrice * lbs * 100)/100;
            if (edit.note != "") {
                edit.price += newPrice;
                edit.note += ", " + note;
            } else {
                edit.price = newPrice;
                edit.note = note;
            }
            STATE = "editSave";
            edit.save();
        }, function() {
            STATE = "user";
            if (edit.note == "") {
                edit.price = 0;
                edit.remove();
            } else {
                edit.save();
            }
        });
    }
};
