package authz

import (
	"github.com/sourcegraph/sourcegraph/internal/api"
	"gopkg.in/inconshreveable/log15.v2"
)

// TODO: docstring
type PermsSyncer struct {
	queue *requestQueue
}

// TODO: docstring
func NewPermsSyncer() *PermsSyncer {
	return &PermsSyncer{
		queue: newRequestQueue(),
	}
}

// TODO: docstring
func (s *PermsSyncer) ScheduleUser(userID int32, priority Priority) error {
	updated := s.queue.enqueue(requestTypeUser, userID, priority)
	log15.Debug("PermsSyncer.queue.upserted", "userID", userID, "updated", updated)
	return nil
}

// TODO: docstring
func (s *PermsSyncer) ScheduleRepo(repoID api.RepoID, priority Priority) error {
	updated := s.queue.enqueue(requestTypeRepo, int32(repoID), priority)
	log15.Debug("PermsSyncer.queue.upserted", "repoID", repoID, "updated", updated)
	return nil
}

// TODO: docstring
func RunPermsSyncer(syncer *PermsSyncer) {
	// TODO
}
