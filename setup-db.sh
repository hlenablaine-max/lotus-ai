#!/bin/bash
# LOTUS AI — Setup PostgreSQL em WSL Ubuntu
# Execute: bash /mnt/c/Users/Icaro/Documents/lotus-ai/setup-db.sh

set -e

echo "=== LOTUS AI: Setup do banco de dados ==="
echo ""

# 1. Iniciar o PostgreSQL
echo "[1/4] Iniciando PostgreSQL 18..."
sudo service postgresql start
sleep 2

# 2. Criar usuário
echo "[2/4] Criando usuário 'lotus'..."
sudo -u postgres psql -tc "SELECT 1 FROM pg_user WHERE usename='lotus'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER lotus WITH PASSWORD 'lotus_dev_2026';"

# 3. Criar banco de dados
echo "[3/4] Criando banco 'lotusai'..."
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='lotusai'" | grep -q 1 || \
  sudo -u postgres createdb -O lotus lotusai

# 4. Verificar
echo "[4/4] Verificando conexão..."
pg_isready -h localhost -p 5433 -U lotus -d lotusai && echo "" && echo "✓ PostgreSQL pronto na porta 5433!"

echo ""
echo "=== Pronto! Agora rode no terminal do projeto: ==="
echo "  cd /mnt/c/Users/Icaro/Documents/lotus-ai/apps/web"
echo "  npx prisma db push"
echo ""
