#!/bin/bash

echo "Starting deployment process..."

# Update the system
sudo yum update -y

# Install Docker if not already installed
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    sudo yum install -y docker
    sudo service docker start
    sudo usermod -a -G docker ec2-user
    sudo chkconfig docker on
fi

# Install Docker Compose if not already installed
if ! command -v docker-compose &> /dev/null; then
    echo "Installing Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
fi

# Install nginx if not already installed
if ! command -v nginx &> /dev/null; then
    echo "Installing nginx..."
    sudo yum install -y nginx
fi

# Configure nginx
echo "Configuring nginx..."
sudo bash -c 'cat > /etc/nginx/conf.d/flask_app.conf << EOL
server {
    listen 80;
    server_name 13.202.203.220;

    location / {
        proxy_pass http://app-web-1:5001;;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
EOL'

# Remove default nginx config if it exists
sudo rm -f /etc/nginx/conf.d/default.conf

# Test nginx configuration
sudo nginx -t

# Start or restart nginx
echo "Starting nginx..."
sudo systemctl restart nginx
sudo systemctl enable nginx

# Start Docker service
sudo service docker start

# Build and run the Docker containers
echo "Building and starting Docker containers..."
sudo docker-compose down || true  # Stop existing containers if any
sudo docker-compose up --build -d

echo "Deployment complete! The application should now be accessible at http://13.202.203.220"