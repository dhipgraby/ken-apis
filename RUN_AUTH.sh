#@echo off
#D:
#cd coding/personal/kenframework/ken-apis

#yarn start-auth

cd /root/ken-apis
git pull
chmod -R 777  /root/ken-apis
docker kill API-Auth
docker rm $(docker ps --filter status=exited -q) 
docker run -w /app --name API-Auth -v /root/ken-api:/app -p 3001:3001 -itd fe6f5eb26002  sh -c "yarn build; yarn start-auth"s