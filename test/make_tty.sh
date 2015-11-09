#!/bin/bash

# uses socat to wrap a script into a tty, to be used in a local browser
sudo socat -dd pty,raw,echo=0,link=/dev/tty.${1##*/} exec:"$*"

#sudo socat -dd pty,raw,echo=0,link=/dev/ttyUSB.Toledo exec:./fakeToledo.sh
