// ==UserScript==
// @name         Lightspeed Serial Scale Bulk Items
// @namespace    https://github.com/gmkarl/lightspeedbulk/
// @version      0.7.3
// @description  Communicates with NCI scales to price bulk items in the Lightspeed Register.
// @author       Karl Semich
// @match        https://*.merchantos.com/register.php*
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
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
    onDonePay : function() {},
    onLineItem : function(item) {},
    onInlineEdit : function(edit) {},
};
(function() {
    try {
        var original_addItemSearch = unsafeWindow.merchantos.register.addItemSearch;
        unsafeWindow.merchantos.register.addItemSearch = cloneInto(function(element) {
            try {
                eventLog.push("onItemSearch(" + JSON.stringify(element.value) + ")");
                handlers.onItemSearch(element.value);
            } catch(e) {
                reportExceptionAsIssue(e,"addItemSearch");
            }
            return original_addItemSearch(element);
        }, unsafeWindow, {cloneFunctions:true});
        var original_donePay = unsafeWindow.merchantos.register.donePay;
        unsafeWindow.merchantos.register.donePay = cloneInto(function() {
            var callOriginal = true;
            try {
                eventLog.push("donePay()");
                callOriginal = handlers.onDonePay();
            } catch(e) {
                reportExceptionAsIssue(e,"donePay");
            }
            if (callOriginal) {
                original_donePay.call(this);
            }
        }, unsafeWindow, {cloneFunctions:true});
        var original_ajaxRegister_Return = unsafeWindow.merchantos.register.ajaxRegister_Return;
        unsafeWindow.merchantos.register.ajaxRegister_Return = cloneInto(function(result) {
            var ret = original_ajaxRegister_Return.call(this, result);
            var item;
            try {
                eventLog.push("ajaxRegister_Return(" + JSON.stringify(result) + ")");
                if ((item = LineItem.fromRegisterReturn(result))) {
                    eventLog.push("onLineItem(" + item.id + ")");
                    if (item.element)
                        handlers.onLineItem(item);
                    else
                        setTimeout(function(){
                            try {
                                handlers.onLineItem(item);
                            } catch(e) {
                                reportExceptionAsIssue(e,"setTimeout onLineItem");
                            }
                        },0);
                } else if ((item = InlineEdit.fromRegisterReturn(result))) {
                    eventLog.push("onInlineEdit(" + item.id + ")");
                    if (item.editElement)
                        handlers.onInlineEdit(item);
                    else
                        setTimeout(function(){
                            try {
                                handlers.onInlineEdit(item);
                            } catch(e) {
                                reportExceptionAsIssue(e,"setTimeout onInlineEdit");
                            }
                        },0);
                }
            } catch(e) {
                reportExceptionAsIssue(e,"ajaxRegister_Return");
            }
            return ret;
        }, unsafeWindow, {cloneFunctions:true});
    } catch(e) {
        reportExceptionAsIssue(e,"hook insertion");
    }
})();

// Submit a github issue about a thrown exception
var reportExceptionAsIssueRequest;
var eventLog = [];
function reportExceptionAsIssue(error, label) {
    try {
        var issueTitle = label + ": " + error.toString();
        var issueStackTrace = error.stack;
        var elem;
        var issueState = "";
        elem = document.getElementById("session_shop");
        issueState += "session_shop: " + session_shop + "\n";
        if (elem) {
            issueState += "session_shop.innerHTML: " + elem.innerHTML + "\n";
        }
        elem = document.getElementById("register");
        issueState += "register: " + elem + "\n";
        if (elem) {
            issueState += "register.style.display: " + elem.style.display + "\n";
        }
        var issueEventLog = eventLog.join("\n")
            .replace(/<select name=\\?"employee_id\\?"[^]*?<\/select>/g, "<!-- censored employee id -->");
        console.log(issueTitle);
        console.log("Stack trace:");
        console.log(issueStackTrace);
        console.log("State:");
        console.log(issueState);
        console.log("Event log:");
        console.log(issueEventLog);
        try {
            if (document.getElementById("session_shop").innerHTML == "Test Store")
                return;
        } catch(e) {}
        reportExceptionAsIssueRequest = GM_xmlhttpRequest({
            url: "https://api.github.com/repos/gmkarl/lightspeedbulk/issues",
            method: "POST",
            headers: {
                "User-Agent": "lightspeedbulk",
                Accept: "application/vnd.github.v3+json",
                Authorization: "token be8980229117ea4298" + "497dc0f7f4af73ac24f040",
                "Content-Type": "application/json"
            },
            data: JSON.stringify({
                title: issueTitle,
                body: "Stack trace:\n```\n" + issueStackTrace + "\n```\nState:\n```\n" + issueState + "\n```\nEvent log:\n```\n" + issueEventLog + "\n```"
            }),
        });
    } catch(e) {
        console.log("exception in exception handler");
        console.log(e.toString());
        console.log(e.stack);
    }
}

////////////////////
// Serial Backend //
////////////////////
// Defines interfaces to serial scales
// requires jUART

function SerialScale(dev, jUARTSerial, implementation) {
    this.status = "Connecting";
    this.jUARTSerial = jUARTSerial;
    this.port = dev;
    this.implementation = implementation;
    if (!this.jUARTSerial.open(dev)) {
        throw new Error("Failed to open serial port: " + dev);
    }
    this.currentMessage = "";
    var self = this;
    this.jUARTSerial.recv_callback(cloneInto(function(bytes, size) {
        if (self.status == "Destroyed") {
            return;
        }
        try {
            for (var i = 0; i < size; ++ i)
                if (!self.recvByte(bytes[i]))
                    break;
        } catch(e) {
            reportExceptionAsIssue(e,"recv_callback");
        }
    }, unsafeWindow, {cloneFunctions:true}));

    this.jUARTSerial.set_option(9600,2,7,0,0);
}
SerialScale.Types = [];
SerialScale.jUART = function() {
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
SerialScale.find = function(success, failure) {
    var serial = null;
    if (SerialScale.singleton) {
        serial = SerialScale.singleton.serial.serial;
    }
    if (!serial) {
        serial = SerialScale.jUART().Serial;
    }
    if (!serial)
        throw new Error("jUART unavailable");
    var destroyObject = {
        destroy : function() {}
    };

    function tryScale(scale, next) {
        destroyObject.destroy = function() {
            scale.destroy();
        }
        scale.validate(function() {
            destroyObject.destroy = function(){};
            try {
                success(scale);
                if (SerialScale.singleton != scale) {
                    console.log("Found " + scale.protocol + " scale at " + scale.serial.port);
                    SerialScale.singleton = scale;
                    GM_setValue('port', scale.serial.port);
                    GM_setValue('protocol', scale.protocol);
                }
            } catch(e) {
                scale.destroy();
                console.log(e.toString());
                console.log(e.stack);
                next();
            }
        }, function() {
            console.log("Device connected to " + scale.serial.port + " not recognized as " + scale.protocol + " scale.");
            destroyObject.destroy = function(){};
            scale.destroy();
            next();
        });
    }

    function tryPort(scaleOrPort, next) {
        if (typeof scaleOrPort != "string") try {
            return tryScale(scaleOrPort, next);
        } catch(e) {
            return next();
        }
        
        var port = scaleOrPort;
        var typeIndex = 0;
        console.log("Looking for scale at " + port);
        function tryNextType() {
            if (typeIndex >= SerialScale.Types.length)
                return next();
            var Type = SerialScale.Types[typeIndex++];
            try {
                return tryScale(new Type(port, serial), tryNextType);
            } catch(e) {
                destroyObject.destroy();
                next();
            }
        }
        tryNextType();
    }

    tryPort(SerialScale.singleton, tryCachedPort);
    function tryCachedPort() {
        var port = GM_getValue('port');
        var protocol = GM_getValue('protocol');
        for (var i in SerialScale.Types)
            if (SerialScale.Types[i].prototype.protocol == protocol) try {
                return tryPort(new SerialScale.Types[i](port, serial), tryPortList);
            } catch(e) {
                console.log(e.toString())
                console.log(e.stack)
            }
        return tryPortList();
    }
    function tryPortList() {
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
    }
    return destroyObject;
};
SerialScale.bitfieldToString = function(field, names) {
    var ret = [];
    for (var i in names) {
        if (field & (1<<i)) {
           ret.push(names[i]);
        }
    }
    if (ret.length == 0)
        return "Weight";
    return ret.join(" ");
};
SerialScale.prototype = {
    destroy: function() {
        this.jUARTSerial.recv_callback(null);
        this.jUARTSerial.close();
        this.status = "Destroyed";
    },
    recvByte: function(byte) {
        this.currentMessage += String.fromCharCode(byte);
        if (byte == this.implementation.endOfMessageByte) {
            this.implementation.processMessage(this.currentMessage);
            this.currentMessage = "";
            if (this.status == "Destroyed")
                return false;
        }
        return true;
    },
    sendByte: function(byte) {
        this.jUARTSerial.send(byte);
    },
};

function Toledo8213(dev, serial) {
    this.serial = new SerialScale(dev, serial, this);
    this.weightStatus = 0;
    this.confidenceStatus = 0;
}
SerialScale.Types.push(Toledo8213);
Toledo8213.weightRE = /^\x02([0-9\.]+)\x0d$/;
Toledo8213.statusRE = /^\x02\?(.)\x0d$/;
Toledo8213.commandReceivedRE = /^\x02\x0d$/;
Toledo8213.confidenceTestStatusRE = /^\x02(.)\x0d$/;
Toledo8213.enterEchoModeRE = /^\x02E\x0d$/;
Toledo8213.exitEchoModeRE = /^\x02F\x0d$/;
Toledo8213.prototype = {
    protocol: "Toledo 8213",
    endOfMessageByte: 0x0d,
    destroy: function() {
        this.serial.destroy();
        this.onStatus = null;
        clearTimeout(this.timeout);
    },
    validate: function(success, failure) {
        var onStatusCache = this.onStatus;
        this.timeout = setTimeout(handleTimeout, 10000);
        var self = this;
        function handleTimeout() {
            self.onStatus = onStatusCache;
            failure();
        }
        function handleStatus(error, status, weight, units) {
            clearTimeout(self.timeout);
            if (self.invalid) return failure();
            self.onStatus = onStatusCache;
            success();
        }
        self.onStatus = handleStatus;
        self.requestWeight();
    },
    get status() {
        if (this.invalid)
            return "Protocol Error";
        return SerialScale.bitfieldToString(this.weightStatus | (this.confidenceStatus << 5), [
            "Motion", "Out of Range", "Under Zero", "Outside Zero Capture Range", "Center of Zero",
            "XICOR RAM Error", "XICOR ROM Error", , "Proc. RAM Error", "ROM Error"
        ]);
    },
    get error() {
        return this.invalid || this.weightStatus != 0 || this.confidenceStatus != 0;
    },
    weight: 0,
    units: 'LB',
    onStatus: function(error, status, weight, units) {},
    validIfEvenParity: function(num) {
        this.invalid = false;
        while (num) {
            if (num & 1)
                this.invalid = !this.invalid;
            num >>= 1;
        }
        if (this.invalid)
            console.log("Parity error");
        return !this.invalid;
    },
    processMessage: function(msg) {
        var res;
        if ((res = Toledo8213.weightRE.exec(msg))) {
            // weight data message
            // <STX>XX.XXX<CR>
            this.weightStatus = 0;
            var weight = res[1];
            if (weight.indexOf('.') == -1)
                this.weight = parseInt(weight) / 100.0;
            else
                this.weight = parseFloat(weight);
        } else if (Toledo8213.statusRE.test(msg)) {
            // status message
            // <STX>?<status byte><CR>
            var status = msg.charCodeAt(2);
            if (this.validIfEvenParity(status))
                this.weightStatus = status & 0x1f;
        } else if (Toledo8213.commandReceivedRE.test(msg)) {
            // command to initiate a confidence test received
            console.log(this.protocol + " confidence test initiated.");
            this.requestTestStatus();
            return;
        } else if (Toledo8213.confidenceTestStatusRE.test(msg)) {
            // confidence test status
            // <STD><status byte><CR>
            var status = msg.charCodeAt(1);
            if (this.validIfEvenParity(status)) {
                console.log(this.protocol + " confidence test complete? " + (status & (1<<6)));
                this.confidenceStatus = status & 0x1f;
            }
        } else {
            console.log("Protocol error: " + msg);
            this.invalid = true;
        }
        this.onStatus(this.error, this.status, this.weight, this.units);
    },
    requestWeight: function() {
        this.serial.sendByte('W');
    },
    requestHighWeight: function() {
        this.serial.sendByte('H');
    },
    zeroScale: function() {
        this.serial.sendByte('Z');
    },
    initiateTest: function() {
        this.serial.sendByte('A');
    },
    requestTestStatus: function() {
        this.serial.sendByte('B');
    },
    /*enterEchoMode: function() {
        this.serial.sendByte('E');
    },
    exitEchoMode: function() {
        this.serial.sendByte('F');
    },*/
};


function NCI(dev, serial) {
    this.serial = new SerialScale(dev, serial, this);
}
SerialScale.Types.push(NCI);
NCI.unrecognizedRE = /^\x0a\?\x0d\x03$/;
NCI.statusRE = /^\x0aS(.)(.)(.?)\x0d\x03$/;
NCI.lbozWeightRE = /^\x0a(.)LB (..\..)OZ\x0d(\x0aS..\x0d\x03)$/;
NCI.decimalWeightRE = /^\x0a(..\....)(..)\x0d(\x0aS..\x0d\x03)$/;
NCI.prototype = {
    protocol: "NCI",
    endOfMessageByte: 0x03,
    destroy: function() {
        this.serial.destroy();
        this.onStatus = null;
        clearTimeout(this.timeout);
    },
    validate: function(success, failure) {
        var onStatusCache = this.onStatus;
        this.timeout = setTimeout(handleTimeout, 10000);
        var self = this;
        function handleTimeout() {
            self.onStatus = onStatusCache;
            failure();
        }
        function handleStatus(error, status, weight, units) {
            clearTimeout(self.timeout);
            if (self.invalid) return failure();
            self.onStatus = onStatusCache;
            success();
        }
        self.onStatus = handleStatus;
        self.requestStatus();
    },
    onStatus: function(error, status, weight, units) {},
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
                this.status = "Motion";
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
        this.serial.sendByte(cmd);
        this.serial.sendByte(0x0d);
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
    '<button tabindex="2001" class="tare-button">Start Tare</button>' +
    '<button tabindex="2002" class="save-button">Save</button>' +
    '<button tabindex="2003" class="cancel-button">Cancel</button>' +
    '</td>' +
    '</tr></tbody>';

var incompleteWeightPrompts = {};

function focusIncompleteWeightPrompt() {
    var elements = document.getElementsByName('edit_item_weight');
    if (elements.length == 0)
        return false;
    var element = elements[0];
    window.eval("merchantos.focus.set('"+element.id+"');");
    return true;
}

function weightPrompt(edit, callback, cancel_callback) {
    var tare = 0;
    var save = save_main;
    var cancel_main = function () { cleanup(); cancel_callback(); };
    var cancel = cancel_main;
    var promptElement = weightPromptElement.cloneNode(true);
    var editItemWeightElement = promptElement.getElementsByClassName('number')[0];
    var startTareElement = promptElement.getElementsByClassName('tare-button')[0];
    var saveElement = promptElement.getElementsByClassName('save-button')[0];
    var cancelElement = promptElement.getElementsByClassName('cancel-button')[0];
    var scaleStatusElement = document.createElement("small");
    var scaleStatusText = document.createTextNode("");
    var scale = null;
    scaleStatusElement.appendChild(scaleStatusText);
    editItemWeightElement.parentElement.appendChild(scaleStatusElement);
    editItemWeightElement.onkeypress = function(event) {
        try {
            if (unsafeWindow.onEnterKey(event, cloneInto(
                                            function(){save();},
                                            unsafeWindow,
                                            {cloneFunctions:true}
                                        )))
                return false;
        } catch(e) {
            reportExceptionAsIssue(e,"editItemWeightElement.onkeypress");
        }
    };
    editItemWeightElement.id = 'edit_item_weight_' + edit.id;
    startTareElement.onclick = function() {
        var nextTare = tare;
        tare = 0;
        startTareElement.style.visibility = "hidden";
        saveElement.innerHTML = "Tare";
        cancelElement.innerHTML = "Abort";
        focusWeightInput();
        save = function() {
            nextTare = parseFloat(editItemWeightElement.value);
            cancel();
            if (nextTare) {
                if (scale.requestWeight) {
                    var onStatusCache = scale.onStatus;
                    save = function(){scale.requestWeight();};
                    scale.onStatus = function(error, status, weight, units) {
                        if (status == "Weight" || status == "Motion") {
                            onStatusCache(error, "Wait for zero (" + status + ")", weight, units);
                        } else {
                            save = save_main;
                            scale.onStatus = onStatusCache;
                            scale.onStatus(error, status, weight, units);
                        }
                    }
                }
                startTareElement.innerHTML = "Retare (" + nextTare + " lb)"
            } else {
                startTareElement.innerHTML = "Start Tare";
            }
            if (scale.requestWeight) {
                scale.requestWeight();
            }
        };
        cancel = function() {
            tare = nextTare;
            startTareElement.style.visibility = "initial";
            saveElement.innerHTML = "Save";
            cancelElement.innerHTML = "Cancel";
            save = save_main;
            cancel = cancel_main;
            editItemWeightElement.value = "";
            focusWeightInput();
        };
    };
    startTareElement.id = 'start_tare_' + edit.id;
    saveElement.onclick = function() {
        try {
            return save();
        } catch(e) {
            reportExceptionAsIssue(e,"saveElement.onclick");
        }
    };
    saveElement.id = 'save_element_weight_' + edit.id;
    if (document.getElementById(saveElement.id))
        document.getElementById(saveElement.id).click();
    cancelElement.onclick = function() {
        try {
            cancel();
            return false;
        } catch(e) {
            reportExceptionAsIssue(e,"cancelElement.onclick");
        }
    };
    promptElement.getElementsByClassName('line-description')[0].innerHTML = edit.description;

    function cleanup() {
        if (scale)
            scale.onStatus = function(){};
        scale = null;
        editItemWeightElement.onkeypress = null;
        startTareElement.onclick = null;
        saveElement.onclick = null;
        cancelElement.onclick = null;
        promptElement = null;
        editItemWeightElement = null;
        startTareElement = null;
        scaleStatusElement = null;
        scaleStatusText = null;
        saveElement = null;
        cancelElement = null;
    }
    
    function save_main() {
        var entry = editItemWeightElement.value;
        var lbs = parseFloat(entry);
        if (entry != "" && entry != "0.0" && entry != "0" && (!(lbs - tare > 0.04) || !(lbs < 30))) {
            lbs = window.prompt("This weight looks unlikely: " + entry + " lbs\nPlease enter or re-enter the proper weight in lbs.  Tare of " + tare + " will be subtracted after.", lbs);
            lbs = parseFloat(lbs);
        }
        if (!lbs) {
            cancel();
        } else {
            cleanup();
            callback(lbs - tare);
        }
        return false;
    }
    
    edit.editElement.parentElement.appendChild(promptElement);
    edit.editElement.style.display = 'none';
    function focusWeightInput() {
        window.eval("merchantos.focus.set('"+editItemWeightElement.id+"');");
    }
    focusWeightInput();
    
    function scaleFound(s) {
        scale = s;
        scaleStatusText.data = "Scale: " + scale.protocol + " found";
        var matchesNeeded = 8;
        var lastWeight = -1;
        var numberMatched = 0;
        scale.onStatus = function(error, status, weight, units) {
            scaleStatusText.data = "Scale: " + status;
            if (!error && units && weight) {
                if (units != 'LB') {
                    scaleStatusText.data = "Scale: " + units + " not LBs";
                } else {
                    if (weight == lastWeight) {
                        numberMatched ++;
                    } else {
                        lastWeight = weight;
                        numberMatched = 0;
                        editItemWeightElement.value = weight;
                    }
                    if (numberMatched >= matchesNeeded) {
                        save();
                        return;
                    }
                }
            } else {
                    lastWeight = -1;
            }
            scale.requestWeight();
        };
        scale.requestWeight();
    }
    
    function noScaleFound() {
        scaleStatusText.data = "Scale: not found";
    }
    
    function lookForScale() {
        scaleStatusText.data = "Scale: searching ...";
        try {
            return SerialScale.find(scaleFound, noScaleFound);
        } catch(e) {
            scaleStatusText.data = "Scale: " + e.message;
        }
    }
    
    scale = lookForScale();
}



////////////////////////
// Main Functionality //
////////////////////////

// bulk item descriptions end in "$x.xx/lb"
// the dollar sign may be missing; the '/' may be a 'per'; the expression may be surrounded in parentheses
var bulkRE = /(?:\(\$?|[\$ ])([0-9\.]*) ?(?:\/|per) ?(#|lb|oz)s?\)?$/;

var STATE = "user";

handlers.onItemSearch = function(text) {
    STATE = "itemSearch";
    eventLog = [eventLog[eventLog.length-1]];
};

handlers.onDonePay = function() {
    if (focusIncompleteWeightPrompt()) {
        window.eval('alertUser("An item needs to be weighed.");');
        return false;
    } else {
        return true;
    }
};

handlers.onLineItem = function(item) {
    if (STATE == "itemSearch") {
        if (item.description.match(bulkRE)) {
            STATE = "editAuto_" + item.id;
            item.element.style.display = "none";
            setTimeout(function(){item.editInline();},0);
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
                note = Math.round(lbs * 16 * 100)/100 + " oz";
                unitPrice *= 16;
            } else {
                note = Math.round(lbs*100)/100 + " lb";
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
