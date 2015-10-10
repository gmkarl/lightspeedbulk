# Lightspeed Serial Scale Bulk Items
Communicates with NCI scales to price bulk items.

If your scale communicates with a cash register via an RS232 cable, it may work with this script.
Additionally, this script will still automatically determine the price of items if the weight is typed in manually.

This script adds a hook into Lightspeed's Register page.
If an item is rung up with a name ending in $x.xx/lb, the user is prompted for the weight of the item, and the price is
adjusted accordingly.  The weight is automatically filled in if a serial scale can be communicated with.

Scale communication requires the jUART plugin.

Using this script requires Tampermonkey or Greasemonkey.


