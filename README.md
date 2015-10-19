# Lightspeed Serial Scale Bulk Items
Communicates with some serial scales to price bulk items.

If you do not have a supported serial scale, this script will still
automatically determine the price of items if the weight is typed in manually.

This script adds a hook into Lightspeed's Register page.  
If an item is rung up with a name ending in "$x.xx/lb" or some similar
patterns, the user is prompted for the weight of the item, and the price is
adjusted accordingly.  The weight is automatically filled in if the script can
communicate with a serial scale.

Scale communication requires the jUART plugin.  https://github.com/billhsu/jUART  
OS X plugin: https://github.com/gmkarl/jUART/raw/merged/bin/OS_X/jUART.dmg  

Lightspeed is a cloud-based point-of-sale system used to manage the workings of
retail stores.  http://www.lightspeedpos.com/

Using this script requires Tampermonkey or Greasemonkey.  
Tampermonkey: http://tampermonkey.net/  
Greasemonkey (Firefox): https://addons.mozilla.org/en-us/firefox/addon/greasemonkey/


## Serial details

I made this script for a CAS PD-1 scale.  It had a proprietary cable which used
DSR and CTS for TxD and RxD, with pin 23 ground.  I didn't have the proper
cable, so had to wire these pins properly manually.  Its protocol supports a
simplified form of the Toledo 8213 weight command.
