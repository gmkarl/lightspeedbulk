#!/bin/bash

# uses socat to wrap a script into a named pipe, for use example by vmware
socat -dd pipe:/tmp/serialpipe.${1##*/} exec:"$*"

#sudo socat -dd pty,raw,echo=0,link=/dev/ttyUSB.Toledo exec:./fakeToledo.sh
