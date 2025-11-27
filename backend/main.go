package main

import (
	"log"
	"net/http"
	"os"

	"github.com/gorilla/mux"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

func main() {
	// Load environment variables
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}
	// Initialize database
	db, err := NewDB()
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	defer db.Close()

	// Run database migrations on every server start
	if err := RunMigrations(db); err != nil {
		log.Fatal("Failed to run database migrations:", err)
	}

	// Initialize handlers
	h := NewHandler(db)

	// Setup routes
	r := mux.NewRouter()

	// CORS middleware - apply before routes so OPTIONS requests are handled
	r.Use(corsMiddleware)

	// API routes
	api := r.PathPrefix("/api").Subrouter()

	// Positions
	api.HandleFunc("/positions", h.GetPositions).Methods("GET")
	api.HandleFunc("/positions", h.CreatePosition).Methods("POST")
	api.HandleFunc("/positions", handleOptions).Methods("OPTIONS")
	api.HandleFunc("/positions/{id}", h.GetPosition).Methods("GET")
	api.HandleFunc("/positions/{id}", h.UpdatePosition).Methods("PUT")
	api.HandleFunc("/positions/{id}", h.DeletePosition).Methods("DELETE")
	api.HandleFunc("/positions/{id}", handleOptions).Methods("OPTIONS")

	// Custom Fields
	api.HandleFunc("/custom-fields", h.GetCustomFields).Methods("GET")
	api.HandleFunc("/custom-fields", h.CreateCustomField).Methods("POST")
	api.HandleFunc("/custom-fields", handleOptions).Methods("OPTIONS")
	api.HandleFunc("/custom-fields/{id}", h.UpdateCustomField).Methods("PUT")
	api.HandleFunc("/custom-fields/{id}", h.DeleteCustomField).Methods("DELETE")
	api.HandleFunc("/custom-fields/{id}", handleOptions).Methods("OPTIONS")

	// Trees
	api.HandleFunc("/trees", h.GetTrees).Methods("GET")
	api.HandleFunc("/trees", h.CreateTree).Methods("POST")
	api.HandleFunc("/trees", handleOptions).Methods("OPTIONS")
	api.HandleFunc("/trees/{id}", h.GetTree).Methods("GET")
	api.HandleFunc("/trees/{id}", h.UpdateTree).Methods("PUT")
	api.HandleFunc("/trees/{id}", h.DeleteTree).Methods("DELETE")
	api.HandleFunc("/trees/{id}", handleOptions).Methods("OPTIONS")
	api.HandleFunc("/trees/{id}/structure", h.GetTreeStructure).Methods("GET")
	api.HandleFunc("/trees/{id}/structure", handleOptions).Methods("OPTIONS")

	port := os.Getenv("SERVER_PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		next.ServeHTTP(w, r)
	})
}

func handleOptions(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
}

