import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.ai.training import train


def test_training_pipeline_short_run():
    with tempfile.TemporaryDirectory() as tmp_dir:
        # Run 3 short episodes
        history = train(
            n_episodes=3,
            max_steps=15,
            checkpoint_frequency=2,
            target_update_frequency=2,
            save_dir=tmp_dir,
            render_log_frequency=1,
        )

        assert len(history["episode_rewards"]) == 3
        assert len(history["birds_scared"]) == 3
        assert len(history["losses"]) == 3
        assert len(history["epsilons"]) == 3

        # Verify best.pth was created
        assert os.path.exists(os.path.join(tmp_dir, "best.pth"))
        # Verify checkpoint_ep2.pth was created
        assert os.path.exists(os.path.join(tmp_dir, "checkpoint_ep2.pth"))
        print("\n✓ Training pipeline test passed successfully!")


if __name__ == "__main__":
    test_training_pipeline_short_run()
