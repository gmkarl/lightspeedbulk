#!/bin/bash

# uses socat to wrap a script into a tty, to be used in a local browser

socat -dddd pty,raw,echo=0,link=/dev/tty."${1##*/}",mode=666 exec:"$*"
