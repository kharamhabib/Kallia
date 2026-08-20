// Package main em cmd/migrate é mantido apenas como stub informativo.
// A plataforma Kallia utiliza SQLite local isolado por sessão (./storage/whatsapp/{id}.db)
// e PocketBase como backend central de dados e autenticação, eliminando qualquer dependência de PostgreSQL.
package main

import "fmt"

func main() {
	fmt.Println("Kallia: Migrações gerenciadas nativamente pelo PocketBase e SQLite.")
}
