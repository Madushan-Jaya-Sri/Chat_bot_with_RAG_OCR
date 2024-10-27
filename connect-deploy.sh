#!/bin/bash

# Set permissions for the PEM file
chmod 400 d_RAG.pem

# Copy deployment script to EC2
scp -i d_RAG.pem deploy.sh ec2-user@13.202.203.220:~/deploy.sh

# Connect to EC2 and run deployment script
ssh -i d_RAG.pem ec2-user@13.202.203.220 "chmod +x ~/deploy.sh && ~/deploy.sh"