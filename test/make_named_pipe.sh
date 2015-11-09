#!/bin/bash

# uses socat to wrap a script into a named pipe, for use example by vmware
socat -dddd pipe:/tmp/serialpipe.${1##*/} exec:"$*"
