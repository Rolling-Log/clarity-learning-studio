"""Run Notebook's worker for local text ingestion only, without model jobs."""
import sys
from pathlib import Path


def local_text_only(name: str, data: dict) -> bool:
    state = data.get("content_state") or {}
    return (
        name == "open_notebook.process_source"
        and data.get("embed") is False
        and data.get("transformations") == []
        and set(state) == {"content"}
        and isinstance(state.get("content"), str)
        and bool(state["content"].strip())
    )


if __name__ == "__main__":
    sys.path.insert(0, str(Path.cwd()))  # Installed Notebook is the working directory.
    from surreal_commands.core.service import command_service
    from surreal_commands.core.worker import run_worker

    original_execute = command_service.execute_command

    async def guarded_execute(command_id, command_name, input_data, user_context=None):
        if not local_text_only(command_name, input_data):
            await command_service.update_command_result(
                command_id, "failed", error_message="Model jobs are disabled during local iteration."
            )
            return None
        return await original_execute(command_id, command_name, input_data, user_context)

    command_service.execute_command = guarded_execute
    run_worker(debug=False, max_tasks=1, import_modules=["commands"])
