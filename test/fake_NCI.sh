#!/bin/bash

. functions.source

sendSmall() {
	echo -ne '\x0a'"$*"'\x0d'
}

sendETX() {
	echo -ne '\x03'
}

send() {
	for msg in "$@"; do
		sendSmall "$msg"
	done
	sendETX
}

sendUnrecognizedCommand() {
	echo "Unrecognized" 1>&2
	send '?'
}

validate() {
	read addr hex asc
	if [ "$hex" != "0d" ]; then
		sendUnrecognizedCommand
		return -1;
	fi
	true
}

stdbuf -oL xxd -c 1 | tee /dev/stderr | while read addr hex asc; do
	case "$asc" in
		"W")
			validate && getWeight | {
				read lbs lbs_integer lbs_frac_numerator lbs_frac_denominator
				if [[ "$lbs" == "0" ]]
				then
					#send 'S\x31\x30'
					echo "No Weight => random status" 1>&2
					send 'S\x3'$(rndhex)'\x3'$(rndhex)
				else
					#send `rnd 2``rnd`.`rnd``rnd``rnd`LB 'S\x30\x30'
					if chance 50
					then
						# decimal weight
						weight=$(printf %02i.%03iLB "$lbs_integer" $((lbs_frac_numerator * 1000 / lbs_frac_denominator)))
						#echo -ne '\x0a'`rnd 2``rnd`.`rnd``rnd``rnd`'LB\x0d\x0aS\x00\x00\x0d\x03'
					else
						# lbs / ozs weight
						ozs=$((lbs_frac_numerator*16/lbs_frac_denominator))
						ozs_frac=$((lbs_frac_numerator*160/lbs_frac_denominator-ozs*10))
						weight="$(printf %01iLB %02i.%01iOZ "$lbs_integer" "$ozs" "$ozs_frac")"
						#echo -ne '\x0a'`rnd`'LB '`rnd 2``rnd 7`.`rnd`'OZ\x0d\x0aS\x00\x00\x0d\x03'
					fi
					echo "Weight $lbs lbs == $lbs_integer and $lbs_frac_numerator / $lbs_frac_denominator => $weight" 1>&2
					send "$weight" 'S\x30\x30'
				fi
			}
		;;
		"S")
			echo "Status" 1>&2
			validate && send 'S\x3'$(rndhex)'\x3'$(rndhex)
		;;
		"Z")
			echo "Zero" 1>&2
			validate && send 'S\x32\x30'
		;;
		*)
			sendUnrecognizedCommand
		;;
	esac
done
