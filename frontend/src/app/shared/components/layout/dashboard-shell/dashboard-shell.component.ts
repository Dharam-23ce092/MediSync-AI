import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { Sidebar } from '../sidebar/sidebar.component';
import { Topbar } from '../topbar/topbar.component';

@Component({
  selector: 'app-dashboard-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, Sidebar, Topbar],
  templateUrl: './dashboard-shell.component.html',
  styleUrl: './dashboard-shell.component.css'
})
export class DashboardShell {}
