# Lightspeed Serial Scale Bulk Items
Communicates with NCI scales to price bulk items.

If your scale communicates with a cash register via an RS232 cable, it may work
with this script.  Additionally, this script will still automatically determine
the price of items if the weight is typed in manually.

This script adds a hook into Lightspeed's Register page.  
If an item is rung up with a name ending in "$x.xx/lb", the user is prompted for
the weight of the item, and the price is adjusted accordingly.  The weight is
automatically filled in if the script can communicate with a serial scale.

Scale communication requires the jUART plugin.  https://github.com/billhsu/jUART  
OS X plugin: https://github.com/gmkarl/jUART/raw/merged/bin/OS_X/jUART.dmg  

Lightspeed is a cloud-based point-of-sale system used to manage the workings of
retail stores.  http://www.lightspeedpos.com/

Using this script requires Tampermonkey or Greasemonkey.  
Tampermonkey: http://tampermonkey.net/  
Greasemonkey (Firefox): https://addons.mozilla.org/en-us/firefox/addon/greasemonkey/


## Serial details

I made this script for a CAS PD-1 scale.  It had a proprietary cable which
wired TxD and RxD on the scale end to DSR and CTS on the computer end.  Normal
serial communication happens on the TxD and RxD pins, not DSR and CTS.

However, I found that plugging a conventional serial cable straight into the
device allowed me to communicate directly with the TxD and RxD pins normally.
The only hitch was the device expected DSR to be shorted to DTR and RTS to CTS
on the device end.  The cable I purchased had different pins shorted and the
scale failed to boot when it was plugged in.  Correcting the shorted pins
resolved the issue.
