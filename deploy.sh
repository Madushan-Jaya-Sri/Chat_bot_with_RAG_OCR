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

# Install Git
sudo yum install -y git

# Clone the repository
git clone https://github.com/Madushan-Jaya-Sri/Chat_bot_with_RAG_OCR.git
cd Chat_bot_with_RAG_OCR

# Create .env file if not exists
touch .env

# Create necessary directories
mkdir -p static/css static/images static/js static/pdfs

# Build and start Docker containers
sudo docker-compose up --build -d

# Configure Nginx
sudo yum install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Create Nginx configuration
sudo tee /etc/nginx/conf.d/flask_app.conf << EOF
server {
    listen 80;
    server_name 13.202.203.220;

    location / {
        proxy_pass http://localhost:5000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF

# Remove default Nginx configuration
sudo rm -f /etc/nginx/conf.d/default.conf

# Restart Nginx
sudo systemctl restart nginx