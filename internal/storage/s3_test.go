package storage

import "testing"

func TestSafeName(t *testing.T) {
	if got := safeName("../../etc/passwd.png"); got != "passwd" {
		t.Fatalf("path: %s", got)
	}
	if got := safeName("a b.jpg"); got != "a_b" {
		t.Fatalf("space: %s", got)
	}
	if got := safeName(""); got != "image" {
		t.Fatalf("empty: %s", got)
	}
}
