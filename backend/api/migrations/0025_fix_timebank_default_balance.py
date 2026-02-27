# Generated migration to fix TimeBank default balance issue
# Updates existing users with 0.00 balance to 3.00 and changes default for new users

from django.db import migrations, models
from decimal import Decimal


def update_zero_balance_users(apps, schema_editor):
    """Update existing users with 0.00 balance to 3.00 hours"""
    User = apps.get_model('api', 'User')
    TransactionHistory = apps.get_model('api', 'TransactionHistory')
    
    # Find users with exactly 0.00 balance
    zero_balance_users = User.objects.filter(timebank_balance=Decimal('0.00'))
    
    for user in zero_balance_users:
        # Update user balance to 3.00
        user.timebank_balance = Decimal('3.00')
        user.save(update_fields=['timebank_balance'])
        
        # Create transaction history record for this adjustment
        TransactionHistory.objects.create(
            user=user,
            transaction_type='adjustment',
            amount=Decimal('3.00'),
            balance_after=Decimal('3.00'),
            description='Initial balance adjustment: Updated from 0.00 to 3.00 hours for existing users'
        )


def reverse_zero_balance_users(apps, schema_editor):
    """Reverse the balance update (for rollback)"""
    User = apps.get_model('api', 'User')
    TransactionHistory = apps.get_model('api', 'TransactionHistory')
    
    # Remove the adjustment transactions we created
    TransactionHistory.objects.filter(
        transaction_type='adjustment',
        amount=Decimal('3.00'),
        description='Initial balance adjustment: Updated from 0.00 to 3.00 hours for existing users'
    ).delete()
    
    # Note: We don't revert user balances as they may have changed since the migration


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0024_rename_api_servic_service_display_idx_api_service_service_b5fef9_idx_and_more'),
    ]

    operations = [
        # First, update existing users with 0.00 balance
        migrations.RunPython(
            update_zero_balance_users,
            reverse_zero_balance_users,
        ),
        
        # Then, change the default value for the field
        migrations.AlterField(
            model_name='user',
            name='timebank_balance',
            field=models.DecimalField(
                decimal_places=2, 
                default=Decimal('3.00'), 
                max_digits=10
            ),
        ),
    ]