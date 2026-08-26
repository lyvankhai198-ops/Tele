#!/bin/bash

# Create a text file containing the list of images and durations for ffmpeg concat demuxer
cat <<EOF > images.txt
file '../screenshots/1-register.jpg'
duration 3
file '../screenshots/2-login.jpg'
duration 3
file '../screenshots/3-accounts.jpg'
duration 3
file '../screenshots/4-accounts-modal.jpg'
duration 3
file '../screenshots/5-templates.jpg'
duration 3
file '../screenshots/6-campaigns.jpg'
duration 3
file '../screenshots/7-campaigns-run.jpg'
duration 3
file '../screenshots/8-logs.jpg'
duration 3
file '../screenshots/9-dashboard.jpg'
duration 3
file '../screenshots/9-dashboard.jpg'
EOF

# Use ffmpeg to generate the video
# We use complex filter to scale the image, add a slight zoom effect (pan/zoom), and burn the subtitles.
# Actually, since these are static UI screenshots, a simple concat with crossfade is best.
# But concat demuxer with subtitles is easiest!

ffmpeg -y -f concat -safe 0 -i images.txt -vf "scale=1280:720,subtitles=subtitles.srt:force_style='FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=2,Shadow=0,MarginV=30'" -c:v libx264 -movflags +faststart -r 30 -pix_fmt yuv420p output.mp4
ffmpeg -y -f concat -safe 0 -i images.txt -vf "scale=1280:720,subtitles=subtitles.srt:force_style='FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=2,Shadow=0,MarginV=30'" -c:v libvpx-vp9 -b:v 0 -crf 32 -row-mt 1 -r 30 output.webm
