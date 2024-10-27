#!/bin/bash

# Update system packages
sudo yum update -y

# Install Docker
sudo yum install -y docker
sudo service docker start
sudo usermod -a -G docker ec2-user
sudo chkconfig docker on

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Create nginx directory if it doesn't exist
mkdir -p nginx

# Pull the latest code and deploy
git pull origin main
sudo docker-compose down
sudo docker-compose build --no-cache
sudo docker-compose up -d

# Clean up unused images
sudo docker image prune -f