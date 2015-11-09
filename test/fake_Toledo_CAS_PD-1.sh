#!/bin/bash

# Provides a fake CAS PD-1 serial scale, with stdin and stdout the serial data
# weight is polled via functions.source getWeight
. functions.source

stdbuf -oL xxd -c 1 | tee /dev/stderr | while read addr hex asc; do
	case "$asc" in
		"W")
			getWeight | {
				read lbs lbs_integer lbs_frac_numerator lbs_frac_denominator
				if [[ "$lbs" == "0" ]]
				then
					echo "No Weight => random status" 1>&2
					send '?'`rndlist A D B P`
				else
					#send '00'`rnd 2``rnd``rnd`
					weight=$(printf %03i%02i "$lbs_integer" $((lbs_frac_numerator * 100 / lbs_frac_denominator)))
					echo "Weight $lbs lbs == $lbs_integer and $lbs_frac_numerator / $lbs_frac_denominator => $weight" 1>&2
					send $weight
				fi
			}
		;;
		*)
			echo "Unrecognized" 1>&2
		;;
	esac
done
