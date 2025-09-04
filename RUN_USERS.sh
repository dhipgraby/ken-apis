
cd /root/kens-apis
git pull
chmod -R 777  /root/kens-apis
docker kill API-Users
docker rm $(docker ps --filter status=exited -q) 
docker run -u "apify" -w /home/apify --name API-Users -v /root/kens-apis:/home/apify -p 3002:3002 -itd --cap-add=SYS_ADMIN node-pupeteer:v1   sh -c "yarn build; yarn start-users"
 