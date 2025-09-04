#@echo off
#D:
#cd coding/personal/kenframework/ken-apis

#yarn start-admin

cd /root/kenframework/ken-apis  
git pull
chmod -R 777  /root/kenframework/ken-apis
docker kill API-Admin
docker rm $(docker ps --filter status=exited -q)
docker run -w /app --name API-Admin -v /root/kenframework/ken-apis:/app -p 3005:3005 -itd fe6f5eb26002  sh -c "yarn build; yarn start-admin"