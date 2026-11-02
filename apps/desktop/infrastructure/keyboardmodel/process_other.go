//go:build !windows

package keyboardmodel

import "os/exec"

func configureProcess(cmd *exec.Cmd) {}
